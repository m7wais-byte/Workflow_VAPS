"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { OperationsWorkspace, WeeklyWork, Clarification, ClarificationReview, LabWorkspace } from './operations-workspace';
import { applyOperation, operationComplete, latest, operationsFor, streamLead, type ActivityRecord, isDraft, canSeeDraft, samplingTeam, pendingActions, samplingStatus, latestData, samplingDataLocked, dataReviewRequired, type Actor, type Operations, type Command } from './operations-model';
import { readTestRouting, storedTestRouting, testRoutingKey, type TestRouting } from './test-routing';
import { readLabTeams, storedLabTeams, labTeamsKey, emptyLabTeams, type LabTeams } from './lab-teams';
import { PvtLab, type LabTestProgress } from "./pvt-lab";
import { itemLabel, labComplete, labItems, planKeys, reconcileLabScope, type LabItem, type LabPlan } from "./lab-work";
import { ClientLogo } from "./client-logo";
import { cylinderCatalog } from "./cylinder-catalog";
import { syncShare } from "./job-sharing";
import { addDays, localDate } from "./local-date";
import { nextJobSequence } from "./job-numbering";
import { standardSheetErrors, samplingIssues, samplingSummary } from "./sampling-validation";
import { defaultFieldData } from "./sample-defaults";
import { containerComplete, containerId, containerLabel, containerNoun, containerTypes, isGlass, type ContainerType } from "./sample-container";
import { buildDemoJobs, demoClient, demoLogin } from "./demo-data";
import { storeWorkbook } from "./workbook-storage";
import { TeamInbox } from "./team-inbox";
import { coordinator, handoff, canWork, eligibleForTeam, type TeamWork } from "./team-workflow";
import { JobWorkflow } from "./job-workflow";
import { jobProgress, trackChanges, type JobProgress, type StageId, type TrackEvent } from "./job-workflow-model";
import { authorizationKey, defaultAuthorization, readAuthorization, allowed, driverMigrationKey, migrateDriverAccess, responsibilitiesKey, defaultResponsibilities, readResponsibilities, roleHolder, responsibilityLabels, storedResponsibilities, unassignedResponsibilities, type Authorization, type Permission, type Responsibilities } from "./authorization";
import { AuthorizationSettings } from "./authorization-settings";
import { initialDirectory, loadDirectory, validateDirectory, directoryKey, type Employee, type Directory } from "./employee-directory";
import { SettingsShell, EmployeeSettings, OptionSettings, CompanySettings, defaultCompany, type Company } from "./settings-pages";
import { BottleSettings } from "./bottle-settings";
import { bottleStorageKey, validateBottle, type Bottle } from "./bottle-inventory";
import { Activity as ActivityIcon, Bell, BriefcaseBusiness, Building2, CalendarDays, ChevronRight, ClipboardList, FileText, FlaskConical, Gauge, LayoutDashboard, ListChecks, MapPin, PackageSearch, Plus, Search, Settings, ShieldCheck, TriangleAlert } from "lucide-react";

function ReviewData({ value }: { value: Record<string, unknown> }) {
  return <dl className="review-data-grid">{Object.entries(value).filter(([key]) => key !== "dataUrl").map(([key, entry]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd>{entry && typeof entry === "object" ? <ReviewData value={entry as Record<string, unknown>} /> : typeof entry === "boolean" ? (entry ? "Yes" : "No") : String(entry ?? "") || "Not recorded"}</dd></div>)}</dl>;
}

function CylinderPicker({ sample, onSelect, onField, inventory }: { inventory: Bottle[]; sample: { id: string; bottle: string; bottleSerial: string; bottleCapacity: string; containerType?: ContainerType; containerId?: string }; onSelect: (serial: string) => void; onField: (field: "containerType" | "containerId", value: string) => void }) {
  const typeSelect = <label><span>Container Type *</span><select value={sample.containerType || "Bottle"} onChange={(event) => onField("containerType", event.target.value)} aria-label={`Container type for sample ${sample.id}`}>{containerTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>;
  if (isGlass(sample)) return <div className="cylinder-picker">{typeSelect}
    <label><span>Glass Container ID *</span><input value={sample.containerId || ""} onChange={(event) => onField("containerId", event.target.value)} aria-label={`Glass container ID for sample ${sample.id}`} placeholder="ID or label written on the container" /></label>
    <p className="cylinder-selection-details">Glass containers are not part of the bottle inventory, so no bottle type or serial is needed.</p>
  </div>;
  return <BottlePicker sample={sample} onSelect={onSelect} inventory={inventory} typeSelect={typeSelect} />;
}

function BottlePicker({ sample, onSelect, inventory, typeSelect }: { inventory: Bottle[]; sample: { id: string; bottle: string; bottleSerial: string; bottleCapacity: string }; onSelect: (serial: string) => void; typeSelect: ReactNode }) {
  const selected = inventory.find((item) => item.serial === sample.bottleSerial);
  const [pendingType, setPendingType] = useState("");
  const legacy = Boolean(sample.bottleSerial && !selected);
  const bottleType = selected?.type || pendingType;
  const types = ["PDS", "Titanium", "SPS", "SPS-SAM", "GSB"];
  const matches = inventory.filter((item) => item.type === bottleType);
  return <div className="cylinder-picker">{typeSelect}
    <label><span>Bottle Type *</span><select value={bottleType} onChange={(event) => { setPendingType(event.target.value); onSelect(""); }} aria-label={`Bottle type for sample ${sample.id}`}><option value="">Select bottle type</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
    <label><span>Serial Number *</span><select disabled={!bottleType} value={selected ? sample.bottleSerial : ""} onChange={(event) => { setPendingType(bottleType); onSelect(event.target.value); }} aria-label={`Serial number for sample ${sample.id}`}><option value="">{bottleType ? "Select serial number" : "Choose bottle type first"}</option>{matches.map((item) => <option key={item.serial} value={item.serial}>{item.serial}</option>)}</select></label>
    {selected && <p className="cylinder-selection-details"><strong>Capacity:</strong> {selected.capacity}<br /><strong>Specification:</strong> {selected.specification.replace("Cylinder - ", "")}</p>}
    {legacy && <p className="cylinder-selection-details">Saved bottle: {sample.bottle} · {sample.bottleSerial} · {sample.bottleCapacity || "Capacity not recorded"}. This serial is not in the current inventory. Choose a type and serial to replace it.</p>}
  </div>;
}

type Stage = "job" | "type" | "bottomhole" | "scope" | "report";
type HoleType = "Open Hole" | "Cased Hole" | "";
type JobStatus = "Draft" | "Job Created" | "Sampling In Progress" | "Sampling Completed" | "Report Draft" | "Awaiting Approval" | "Completed";
type ScopeAttachment = { name: string; type: string; size: number; dataUrl: string };
type ReportRecord = { summary: string; preparedBy: string; preparedDate: string; approvedBy: string; approvalDate: string; reportStatus: "Draft" | "Awaiting Approval" | "Completed"; submittedBy?: string; submittedAt?: string; approvedAt?: string };
type Sample = {
  id: string;
  sampler: string;
  bottle: string;
  samplerSerial: string;
  bottleSerial: string;
  bottleCapacity: string;
  /** Missing on records saved before glass containers were supported; those are bottles. */
  containerType?: ContainerType;
  /** Glass-container identifier. Bottles keep using bottleSerial from the inventory. */
  containerId?: string;
  calibrationStatus: string;
  pressureTestStatus: string;
  equipmentCondition: string;
  preparedBy: string;
  preparedAt: string;
  preparationRemarks: string;
  fieldData: Record<string, string>;
  dataComplete: boolean;
  dataCompletedBy: string;
  dataCompletedAt: string;
  pressure: string;
  temperature: string;
  depth: string;
  notes: string;
};

type Client = {
  logo?: string;
  code: string;
  name: string;
  shortName: string;
  country: string;
  notes: string;
  active: boolean;
};

type ClientForm = Omit<Client, "active">;


type WorkflowStatus = "Not Started" | "In Progress" | "Completed" | "Skipped";
type WorkflowStage = {
  name: string;
  assignedTo: string;
  status: WorkflowStatus;
  started?: string;
  completed?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
};

type SamplingSource = "Open Hole (SPMC - Field Sampling)" | "Open Hole (MPSR - Lab Transfer)" | "Open Hole (MDT Transfer)" | "Cased Hole (Bottomhole / Downhole Sampling)" | "Wellhead Sampling" | "Separator Sampling" | "Station Sampling" | "Other";

type JobDetails = {
  countryCode: string;
  dateReceived: string;
  fieldArea: string;
  employee: string;
  assignedEngineerId: string;
  assignedDriverId: string;
  requestedSampleCount: string;
  samplingInstructions: string;
  /** Supporting sampling employees; assignedEngineerId is the accountable lead. */
  samplingTeamIds: string[];
  requiredTests: string[];
  otherTests: string;
  sampleCountNotes: string;
  clientFocalPoint: string;
  clientFocalPointContact: string;
  clientFocalPointEmail: string;
  dueDate: string;
  description: string;
  well: string;
  wellMode: "single" | "multiple";
  wells: string[];
  rigInstallation: string;
  plannedDepth: string;
  formation: string;
  perforationInterval: string;
  wellheadLocation: string;
  chokeSize: string;
  whp: string;
  wht: string;
  facility: string;
  separatorId: string;
  separatorStage: string;
  samplingPoint: string;
  separatorPressure: string;
  separatorTemperature: string;
  relatedWell: string;
  locationNotes: string;
  otherDescription: string;
  otherSamplingType: string;
  oilRate: string;
  gasRate: string;
  waterRate: string;
};

export type JobRecord = {
 operations?: Operations;
 teamWork?: TeamWork;
  workflowHistory?: TrackEvent[];
  labTests?: Record<string, LabTestProgress>;
  labPlan?: LabPlan;
  id: string;
  globalSequence: number;
  jobNumber: string;
  clientCode: string;
  clientName: string;
  countryCode?: string;
  dateReceived?: string;
  description?: string;
  clientFocalPoint?: string;
  clientFocalPointContact?: string;
  clientFocalPointEmail?: string;
  clientReference?: string;
  samplingRequired?: boolean;
  samplingSource?: SamplingSource;
  holeType?: HoleType;
  scopeOfWorkAttachment?: ScopeAttachment;
  samples?: Sample[];
  events?: SequenceEvent[];
  report?: ReportRecord;
  coordinationTasks?: CoordinationTask[];
  coordinationDetails?: CoordinationDetails;
  fieldArea: string;
  well?: string;
  wellMode?: "single" | "multiple";
  wells?: string[];
  rigInstallation?: string;
  plannedDepth?: string;
  formation?: string;
  perforationInterval?: string;
  wellheadLocation?: string;
  chokeSize?: string;
  whp?: string;
  wht?: string;
  facility?: string;
  separatorId?: string;
  separatorStage?: string;
  samplingPoint?: string;
  separatorPressure?: string;
  separatorTemperature?: string;
  relatedWell?: string;
  locationNotes?: string;
  otherDescription?: string;
  otherSamplingType?: string;
  oilRate?: string;
  gasRate?: string;
  waterRate?: string;
  dueDate: string;
  status: JobStatus;
  currentStage: string;
  nextAction: string;
  ownerId: string;
  responsibleId: string;
  jobResponsibleId?: string;
  assignedEngineerId?: string;
  assignedDriverId?: string;
  requestedSampleCount?: string;
  /** Requirements and notes from the job creator for the assigned sampling employees. */
  samplingInstructions?: string;
  /** Supporting sampling employees; assignedEngineerId is the accountable lead. */
  samplingTeamIds?: string[];
  /** Laboratory tests requested at creation: reference only. The laboratory scope is selected after sampling approval. */
  requiredTests?: string[];
  otherTests?: string;
  sampleCountNotes?: string;
  createdById: string;
  createdAt: string;
  lastUpdatedById: string;
  lastUpdatedAt: string;
  stages: WorkflowStage[];
};

type Activity = {
  id: string;
  employeeId: string;
  action: string;
  jobId: string;
  timestamp: string;
};

type SequenceEvent = {
  date?: string;
  time: string;
  description: string;
  createdBy?: string;
  createdAt?: string;
};

type CoordinationTask = {
  id: string;
  label: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
};

type CoordinationDetails = {
  contactNotes?: string;
  missingTools?: string;
  toolsRequired: string;
  toolsAvailability: string;
  toolsConfirmedBy?: string;
  toolsConfirmedAt?: string;
  samplingPointType: string;
  samplingPointSize: string;
  requiredSampleKit: string;
  requiredCylinders: string;
  sampleOwner: string;
  requiredItems: string;
};

type WorkspaceView = "inventory" | "pvt-lab" | "dashboard" | "jobs" | "new-job" | "sampling" | "settings" | "profile";

const workflowStageNames = ["Job Setup", "Sampling Preparation", "Sampling Data", "Report Preview", "Final Report"];
const samplingSources: SamplingSource[] = ["Open Hole (SPMC - Field Sampling)", "Open Hole (MPSR - Lab Transfer)", "Cased Hole (Bottomhole / Downhole Sampling)", "Wellhead Sampling", "Separator Sampling", "Station Sampling", "Other"];
const samplingIsRequired = (source: SamplingSource | "") => Boolean(source && source !== "Open Hole (MPSR - Lab Transfer)" && source !== "Open Hole (MDT Transfer)" && source !== "Other");
const isCasedHoleSampling = (source: SamplingSource | "") => source === "Cased Hole (Bottomhole / Downhole Sampling)";
const isSpmcFieldSampling = (source: SamplingSource | "") => source === "Open Hole (SPMC - Field Sampling)";
const isMpsrLabTransfer = (source: SamplingSource | "") => source === "Open Hole (MPSR - Lab Transfer)" || source === "Open Hole (MDT Transfer)";
const requiresEquipmentPreparation = (source: SamplingSource | "") => isCasedHoleSampling(source) || isSpmcFieldSampling(source);
const jobCountries = [
  { code: "OM", name: "Oman" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "IQ", name: "Iraq" },
];
const emptyCoordinationDetails = (): CoordinationDetails => ({ toolsRequired: "To Be Confirmed", toolsAvailability: "To Be Confirmed", samplingPointType: "", samplingPointSize: "", requiredSampleKit: "", requiredCylinders: "", sampleOwner: "", requiredItems: "" });
const coordinationTaskLabels = (source: SamplingSource | "") => {
  if (isMpsrLabTransfer(source)) return ["Contact the sample owner", "Confirm the required transfer items", "Receive or collect the samples", "Complete sample restoration and transfer", "Return tools and items to the owner"];
  if (source === "Wellhead Sampling") return ["Contact the field focal point", "Confirm whether tools are required", "Confirm tools availability", "Confirm wellhead sampling point type", "Confirm wellhead sampling point size", "Assign the required sample kit", "Assign the required cylinders"];
  if (source === "Separator Sampling") return ["Contact the field focal point", "Confirm whether tools are required", "Confirm tools availability", "Confirm separator sampling point", "Confirm separator sampling point type and size", "Assign the required sample kit", "Assign the required cylinders"];
  if (source === "Other") return ["Confirm the responsible contact", "Confirm job-specific requirements", "Assign required logistics", "Confirm readiness to proceed"];
  return ["Contact the field focal point", "Confirm whether tools are required", "Confirm tools availability", "Assign the required sample kit", "Assign the required cylinders"];
};
const createCoordinationTasks = (source: SamplingSource | "", existing: CoordinationTask[] = []) => coordinationTaskLabels(source).map((label, index) => {
  const current = existing.find((item) => item.label === label);
  return current || { id: `${index + 1}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label, completed: false };
});

const sessionStorageKey = "vaps-demo-session-v1";
const jobsStorageKey = "vaps-demo-jobs-v1";
const activityStorageKey = "vaps-demo-activity-v1";
const samplingSeenKey = "vaps-sampling-seen-v1";
const trackingYear = new Date().getFullYear();
const trackingYearShort = String(trackingYear).slice(-2);
const globalCounterStorageKey = `vaps-demo-global-job-counter-${trackingYear}-om-format-v2`;

const defaultJobs: JobRecord[] = [];
const newActivityId = () => `${Date.now()}-${Math.random()}`;
const defaultActivities: Activity[] = [];

const defaultClients: Client[] = [
  { code: "P", shortName: "PDO", name: "Petroleum Development Oman", country: "Oman", notes: "", active: true },
  { code: "Q", shortName: "OQ", name: "OQ", country: "Oman", notes: "", active: true },
  { code: "O", shortName: "Oxy", name: "Oxy", country: "Oman", notes: "", active: true },
  { code: "C", shortName: "CCED", name: "CCED", country: "Oman", notes: "", active: true },
  { code: "D", shortName: "Daleel", name: "Daleel", country: "Oman", notes: "", active: true },
  { code: "B", shortName: "Bayaq", name: "Bayaq", country: "Oman", notes: "", active: true },
  { code: "W", shortName: "Wemby", name: "Wemby", country: "Oman", notes: "", active: true },
];

const emptyClientForm: ClientForm = { code: "", name: "", shortName: "", country: "Oman", notes: "" };
const clientStorageKey = "vaps-demo-clients-v1";

const emptyJobDetails = (): JobDetails => ({
  requestedSampleCount: "3", samplingInstructions: "", samplingTeamIds: [], requiredTests: [], otherTests: "", sampleCountNotes: "",
  countryCode: "OM", dateReceived: localDate(), fieldArea: "", employee: "", assignedEngineerId: "", assignedDriverId: "", clientFocalPoint: "", clientFocalPointContact: "", clientFocalPointEmail: "", dueDate: "", description: "",
  well: "", wellMode: "single", wells: [""], rigInstallation: "", plannedDepth: "", formation: "", perforationInterval: "", wellheadLocation: "", chokeSize: "", whp: "", wht: "",
  facility: "", separatorId: "", separatorStage: "", samplingPoint: "", separatorPressure: "", separatorTemperature: "", relatedWell: "", locationNotes: "", otherDescription: "", otherSamplingType: "",
  oilRate: "", gasRate: "", waterRate: "",
});

const samplerTypes = ["SPS", "SRS", "MPSR", "SPMC", "Baker BHS"];
const pressureUnits = ["kPa", "bar", "psi"];
const temperatureUnits = ["°C", "°F"];
const volumeUnits = ["cc", "mL"];
const navItems = ["Dashboard", "Jobs", "Sampling", "PVT Lab", "Inventory", "Settings"];
const navIcons = [LayoutDashboard, BriefcaseBusiness, FlaskConical, ListChecks, PackageSearch, Settings];

const standardConditionFields = [
  "flowPeriod", "formation", "perforations", "sampleBottleVolume", "sampleVolume", "fluidRemaining", "initialOpeningPressure", "initialOpeningTemperature", "receivingBottleOpeningPressure", "receivingBottleOpeningTemperature", "transferPressure", "transferTemperature", "finalPressure", "finalTemperature", "transferDuration", "bhp", "bht", "whp", "wht", "chokeSize", "stableSince", "separatorPressure", "separatorTemperature", "oilRate", "correctedBy", "gasRate", "waterRate", "gasGravity", "condensateGravity", "oilLineTemperature", "gasDifferentialPressure", "gasPressure", "gasTemperature", "fbFactor", "fpvFactor", "cgr", "wor", "bsw", "h2s", "co2",
];

const emptySamples = (): Sample[] => ["1.01", "1.02", "1.03"].map((id) => ({
  id, sampler: "SPS", bottle: "PDS", samplerSerial: "", bottleSerial: "", bottleCapacity: "", calibrationStatus: "Not Checked", pressureTestStatus: "Not Checked", equipmentCondition: "Not Checked", preparedBy: "", preparedAt: "", preparationRemarks: "", fieldData: defaultFieldData(), dataComplete: false, dataCompletedBy: "", dataCompletedAt: "", pressure: "", temperature: "", depth: "", notes: "",
}));

export default function Home() {
  const [directory, setDirectory] = useState(initialDirectory);
  const demoEmployees = directory.employees;
  const [directoryError, setDirectoryError] = useState('');
  const [company, setCompany] = useState<Company>(defaultCompany);
  const [editorRoute,setEditorRoute]=useState<string[]>([]);
  const [operationTab,setOperationTab]=useState('overview');
  const [workspaceView, setWorkspaceViewState] = useState<"workflow" | WorkspaceView>("dashboard");
  const [workflowJobId, setWorkflowJobId] = useState("");
  const [legacyView,setLegacyView]=useState(false);
  const [dispatchReview,setDispatchReview]=useState(false);
  const [settingsPage, setSettingsPage] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientStatus, setClientStatus] = useState('all');
  useEffect(() => {
    // Saved records live in browser storage, so they are loaded after mount to keep server and client HTML identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setDirectory(loadDirectory()); const raw=localStorage.getItem('vaps-company-v1'); if(raw) setCompany(JSON.parse(raw)); } catch(e) { setDirectoryError(e instanceof Error?e.message:'Could not load settings.'); }
    const route = (event?: HashChangeEvent) => { if(event && window.confirmSettingsLeave && !window.confirmSettingsLeave()){history.replaceState(null,"",event.oldURL);return;} const parts=location.hash.slice(1).split('/'); if(parts[0]==='settings') { setWorkspaceViewState('settings'); setSettingsPage(parts[1]||''); } else {setWorkspaceViewState((parts[0] || 'dashboard') as WorkspaceView);if(parts[0]==='new-job'&&parts[1])setEditorRoute(parts.slice(1));if(parts[0]==='workflow'){if(parts[1])setWorkflowJobId(decodeURIComponent(parts[1]));setOperationTab(parts[2]?.split('?')[0]||'overview');setLegacyView(false);}}; };
    route(); window.addEventListener('hashchange',route); return ()=>window.removeEventListener('hashchange',route);
  }, []);
  /** The sampling step an employee should land on for this job's current status. */
  function samplingStageFor(item: JobRecord): Stage {
    const status = samplingStatus(item, responsibilities);
    if (status.key === "preparation") return "type";
    if (status.key === "returned" && status.tab === "sampling") { const first = latestData(item)?.comments[0]?.target || ""; return first === "preparation" || first === "job" ? "type" : "bottomhole"; }
    if (status.key === "data") return item.samples?.length && item.samples.every((sample) => sample.dataComplete) ? "report" : "bottomhole";
    return "report";
  }
  function openOperation(item:JobRecord,tab='overview') {location.assign('#workflow/'+encodeURIComponent(item.id)+'/'+tab);}
  function runOperation(id:string,command:Command) {
    if(!currentEmployee)throw Error('Select an active trial profile.');
    const stored:JobRecord[]=JSON.parse(localStorage.getItem(jobsStorageKey)||'[]');
    const target=stored.find(j=>j.id===id);if(!target)throw Error('Job no longer exists.');
    const shown=jobs.find(j=>j.id===id);if(target.operations?.revision!==shown?.operations?.revision)throw Error('This job changed in another view. Refresh before saving; your edits have been retained.');
    const updated=applyOperation(target,command,freshActor());
    persistJobs(stored.map(j=>j.id===id?updated:j));
  }
  /** Settings re-read at the moment of action, so a review panel opened earlier cannot act on stale assignments. */
  function freshActor(): Actor {
    if(!currentEmployee)throw Error('Select an active trial profile.');
    const employees=loadDirectory().employees;
    return {id:currentEmployee.id,employees,policy:readAuthorization(localStorage.getItem(authorizationKey),employees.map(e=>e.id)),roles:storedResponsibilities(),routing:storedTestRouting(),teams:storedLabTeams(employees.map(e=>e.id))};
  }
  function setWorkspaceView(view: 'workflow' | WorkspaceView) { location.assign('#'+view); }
  function saveDirectory(next: Directory) {
    if(!hasPermission('employees') || directoryError) throw Error('You cannot manage the employee directory.');
    for(const e of next.employees) {const old=directory.employees.find(p=>p.id===e.id);for(const [kind,key] of [['departments','departmentId'],['positions','positionId']] as const){if(e[key]!==old?.[key]&&!next[kind].some(o=>o.id===e[key]&&o.active))throw Error('Choose an active department and position.');}}
    validateDirectory(next); localStorage.setItem(directoryKey,JSON.stringify(next)); setDirectory(next);
    if(currentEmployee) setCurrentEmployee(next.employees.find(e=>e.id===currentEmployee.id && e.active)||null);
  }
  const [stage, setStage] = useState<Stage>("job");
  const [authReady, setAuthReady] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [authorization, setAuthorization] = useState<Authorization>(() => defaultAuthorization(demoEmployees.map(person => person.id)));
  const [authorizationError, setAuthorizationError] = useState("");
  const [responsibilities, setResponsibilities] = useState<Responsibilities>(() => ({ ...defaultResponsibilities }));
  const [responsibilitiesError, setResponsibilitiesError] = useState("");
  const [testRouting, setTestRouting] = useState<TestRouting>({});
  const [testRoutingError, setTestRoutingError] = useState("");
  const [labTeams, setLabTeams] = useState<LabTeams>(emptyLabTeams);
  const [labTeamsError, setLabTeamsError] = useState("");
  const hasPermission = (permission: Permission) => !directoryError && !!demoEmployees.find(e=>e.id===currentEmployee?.id && e.active) && !authorizationError && allowed(authorization, currentEmployee?.id, permission);
  const canView = (view: string) => {
    if (view === "settings") return ["settings", "company", "employees", "authorization"].some(p=>hasPermission(p as Permission));
    if (view === "new-job") return createdJobId ? hasPermission("jobDetails") && (stage === "job" || hasPermission("sampling")) : hasPermission("createJob");
    const permission = ({ jobs: "jobDetails", workflow: "jobDetails", sampling: "sampling", "pvt-lab": "analysis", inventory: "inventory" } as Record<string, Permission>)[view];
    return !permission || hasPermission(permission);
  };
  useEffect(() => {
    const load = () => {
      try {
        const raw=window.localStorage.getItem(authorizationKey); const ids=loadDirectory().employees.map(person=>person.id); let policy=readAuthorization(raw,ids);
        // One-time driver access for an employee added by migration; later administrator edits are kept.
        if(!window.localStorage.getItem(driverMigrationKey)){ policy=migrateDriverAccess(policy,ids); window.localStorage.setItem(authorizationKey,JSON.stringify(policy)); window.localStorage.setItem(driverMigrationKey,new Date().toISOString()); }
        else if(raw===null) window.localStorage.setItem(authorizationKey,JSON.stringify(policy));
        setAuthorization(policy); setAuthorizationError("");
      }
      catch { setAuthorizationError("Saved authorization could not be loaded. Access is disabled until the settings are restored."); }
      try { const raw=window.localStorage.getItem(responsibilitiesKey); const roles=readResponsibilities(raw); if(raw===null) window.localStorage.setItem(responsibilitiesKey,JSON.stringify(roles)); setResponsibilities(roles); setResponsibilitiesError(""); }
      catch { setResponsibilities({...unassignedResponsibilities}); setResponsibilitiesError("Saved responsibilities could not be loaded. Every workflow duty is blocked until they are saved again."); }
      try { setTestRouting(readTestRouting(window.localStorage.getItem(testRoutingKey))); setTestRoutingError(""); }
      catch { setTestRouting({}); setTestRoutingError("Saved test routing could not be loaded. Laboratory scope release is blocked until it is restored."); }
      try { setLabTeams(readLabTeams(window.localStorage.getItem(labTeamsKey), loadDirectory().employees.map(person => person.id))); setLabTeamsError(""); }
      catch { setLabTeams(emptyLabTeams()); setLabTeamsError("Saved laboratory teams could not be loaded. Test assignment is blocked until they are saved again."); }
    };
    load();
    const onStorage = (event: StorageEvent) => { if (event.key === authorizationKey || event.key === responsibilitiesKey || event.key === testRoutingKey || event.key === labTeamsKey || event.key === null) load(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const [loginForm, setLoginForm] = useState({ id: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [customBottles, setCustomBottles] = useState<Bottle[]>([]);
  const [bottleLoadError, setBottleLoadError] = useState("");
  const bottleInventory = [...cylinderCatalog, ...customBottles];
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(bottleStorageKey) || "[]");
      if (!Array.isArray(saved)) throw new Error("Invalid bottle inventory");
      const loaded: Bottle[] = [];
      for (const bottle of saved) {
        if (!bottle || ![bottle.type, bottle.serial, bottle.capacity, bottle.specification].every((value) => typeof value === "string")) throw new Error("Invalid bottle record");
        if (cylinderCatalog.some((item) => item.serial.toLowerCase() === bottle.serial.trim().toLowerCase())) continue;
        if (validateBottle(bottle, loaded)) throw new Error("Invalid bottle record");
        loaded.push(bottle);
      }
      // Saved records live in browser storage, so they are loaded after mount to keep server and client HTML identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomBottles(loaded);
    } catch { setBottleLoadError("Saved bottle inventory could not be loaded. Adding bottles is disabled to protect the saved records."); }
  }, []);
  const [jobs, setJobs] = useState<JobRecord[]>(defaultJobs);
  const [seenSampling, setSeenSampling] = useState<Record<string, string[]>>({});
  useEffect(() => { try { const raw = localStorage.getItem(samplingSeenKey); // Per-browser marker of which shared events this employee has opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (raw) setSeenSampling(JSON.parse(raw)); } catch { /* indicators simply show again */ } }, []);
  const [activities, setActivities] = useState<Activity[]>(defaultActivities);
  const [trackedSamples, setTrackedSamples] = useState<string[]>([]);
  const [dashboardFilter, setDashboardFilter] = useState<"all" | "sampling" | "reports" | "due">("all");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [jobsRegisterFilter, setJobsRegisterFilter] = useState<"mine" | "active" | "drafts" | "completed" | "all">("active");
  const [jobsRegisterStage, setJobsRegisterStage] = useState("");
  const [jobsRegisterSearch, setJobsRegisterSearch] = useState("");
  const [labJobId, setLabJobId] = useState("");
  const [samplingTab, setSamplingTab] = useState<"jobs" | "reports">("jobs");
  const [selectedJobDetailsId, setSelectedJobDetailsId] = useState("");
  const [expandedDashboardJob, setExpandedDashboardJob] = useState("");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [timeGreeting, setTimeGreeting] = useState("Good morning");
  const [clients, setClients] = useState<Client[]>(defaultClients);
  const [client, setClient] = useState("P");
  const [clientModal, setClientModal] = useState<{ mode: "add" | "edit"; originalCode?: string } | null>(null);
  const clientNameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (clientModal) clientNameInput.current?.focus(); }, [clientModal]);
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
  const [clientError, setClientError] = useState("");
  const [jobErrors, setJobErrors] = useState<string[]>([]);
  const [job, setJob] = useState<JobDetails>(emptyJobDetails);
  const [createdJobId, setCreatedJobId] = useState("");
  const [globalCounter, setGlobalCounter] = useState(0);
  const [samplingRequired, setSamplingRequired] = useState<boolean | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [samplingType, setSamplingType] = useState<SamplingSource | "">("");
  const [holeType, setHoleType] = useState<HoleType>("");
  const [scopeAttachment, setScopeAttachment] = useState<ScopeAttachment | null>(null);
  const [preparationStartedAt, setPreparationStartedAt] = useState("");
  const [preparationCompletedAt, setPreparationCompletedAt] = useState("");
  const [preparationNotes, setPreparationNotes] = useState("");
  const [preparationError, setPreparationError] = useState<string[]>([]);
  const [coordinationTasks, setCoordinationTasks] = useState<CoordinationTask[]>([]);
  const [coordinationDetails, setCoordinationDetails] = useState<CoordinationDetails>(emptyCoordinationDetails);
  const [sampleDataErrors, setSampleDataErrors] = useState<Record<string, string[]>>({});
  const [samplingDataCompletedAt, setSamplingDataCompletedAt] = useState("");
  const [expanded, setExpanded] = useState<string>("");
  const [events, setEvents] = useState<SequenceEvent[]>([]);
  const [eventDraft, setEventDraft] = useState({ date: localDate(), time: "", description: "" });
  const [report, setReport] = useState<ReportRecord>({ summary: "", preparedBy: "", preparedDate: "", approvedBy: "", approvalDate: "", reportStatus: "Draft" });
  const [reportErrors, setReportErrors] = useState<string[]>([]);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      setTimeGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    };

    updateGreeting();
    const greetingTimer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(greetingTimer);
  }, []);

  useEffect(() => {
    try {
      const employeeId = window.sessionStorage.getItem(sessionStorageKey);
      setCurrentEmployee(loadDirectory().employees.find((employee) => employee.id === employeeId && employee.active) ?? null);
        const storedJobs = window.localStorage.getItem(jobsStorageKey);
        const storedActivities = window.localStorage.getItem(activityStorageKey);
        if (storedJobs) {
          const parsedJobs = JSON.parse(storedJobs) as JobRecord[];
          // Saved records live in browser storage, so they are loaded after mount to keep server and client HTML identical.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setJobs(parsedJobs);
          const storedCounter = Number(window.localStorage.getItem(globalCounterStorageKey));
          const derivedCounter = parsedJobs.reduce((maximum, item) => {
            const match = item.id.match(/^[A-Z]{2}-[A-Z0-9]-(\d{2})-(\d+)$/i);
            return match?.[1] === trackingYearShort ? Math.max(maximum, Number(match[2]) || 0) : maximum;
          }, 0);
          setGlobalCounter(Math.max(storedCounter || 0, derivedCounter));
        } else {
          setGlobalCounter(Number(window.localStorage.getItem(globalCounterStorageKey)) || 0);
        }
        if (storedActivities) setActivities(JSON.parse(storedActivities));
    } catch {
      window.sessionStorage.removeItem(sessionStorageKey);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(clientStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Client[];
      if (Array.isArray(parsed) && parsed.length && parsed.every((item) => typeof item.code === "string" && typeof item.name === "string")) {
        // Saved records live in browser storage, so they are loaded after mount to keep server and client HTML identical.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setClients(parsed);
        if (!parsed.some((item) => item.code === client && item.active)) {
          setClient(parsed.find((item) => item.active)?.code ?? "P");
        }
      }
    } catch {
      setNotice("Saved clients could not be loaded. Existing storage was preserved.");
    }
  }, []);

  const selectedClient = clients.find((item) => item.code === client);
  const clientName = selectedClient?.shortName || selectedClient?.name || "";
  const clientJobPrefix = client.trim().toUpperCase().slice(0, 1);
  const nextSequence = nextJobSequence(globalCounter, jobs, trackingYearShort);
  const generatedJobId = `${job.countryCode}-${clientJobPrefix}-${trackingYearShort}-${String(nextSequence).padStart(3, "0")}`;
  const jobId = createdJobId || generatedJobId;
  const samplingTypeLabel = samplingType === "Other" && job.otherSamplingType.trim() ? `Other — ${job.otherSamplingType.trim()}` : samplingType;
  const activeClients = clients.filter((item) => item.active);
  const locationParts = (item: Partial<JobRecord & JobDetails>, source?: SamplingSource | "") => {
    const samplingSource = source || item.samplingSource || "";
    const parts = isCasedHoleSampling(samplingSource)
      ? [item.fieldArea, item.well, item.rigInstallation]
      : samplingSource === "Wellhead Sampling"
        ? [item.fieldArea, item.well, "Wellhead"]
        : samplingSource === "Separator Sampling" || samplingSource === "Station Sampling"
          ? [item.fieldArea, item.facility, item.separatorId ? `Separator ${item.separatorId}` : ""]
          : samplingSource === "Other"
            ? [item.facility || item.fieldArea, item.samplingPoint]
            : [item.fieldArea];
    return parts.filter((value): value is string => Boolean(value?.trim()));
  };
  const locationSummary = (item: Partial<JobRecord & JobDetails>, source?: SamplingSource | "") => locationParts(item, source).join(" · ") || "Location pending";
  const locationDetails = (item: Partial<JobRecord & JobDetails>, source?: SamplingSource | "") => {
    const samplingSource = source || item.samplingSource || "";
    const candidates = isCasedHoleSampling(samplingSource)
      ? [["FIELD / AREA", item.fieldArea], ["WELL", item.well], ["RIG / INSTALLATION", item.rigInstallation], ["PLANNED DEPTH", item.plannedDepth]]
      : samplingSource === "Wellhead Sampling"
        ? [["FIELD / AREA", item.fieldArea], ["WELL", item.well], ["LOCATION", item.wellheadLocation || "Wellhead"]]
        : samplingSource === "Separator Sampling" || samplingSource === "Station Sampling"
          ? [["FIELD / AREA", item.fieldArea], ["FACILITY / STATION", item.facility], ["SEPARATOR", item.separatorId], ["SAMPLING POINT", item.samplingPoint], ["RELATED WELL", item.relatedWell]]
          : samplingSource === "Other"
            ? [["LOCATION / FACILITY", item.facility || item.fieldArea], ["SAMPLING POINT", item.samplingPoint]]
            : [["FIELD / AREA", item.fieldArea]];
    return candidates.filter((entry): entry is string[] => Boolean(entry[1]?.trim()));
  };
  const employeeName = (employeeId?: string) => demoEmployees.find((employee) => employee.id === employeeId)?.name ?? "Not specified";
  const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)) : "Not recorded";
  const currentJob = jobs.find((item) => item.id === jobId);
  /** The configured sampling approver for actions taken now. Recorded approvals keep their own approver. */
  const samplingApprover = roleHolder(responsibilities, "samplingApproval", demoEmployees);
  const opsActor: Actor | null = currentEmployee ? { id: currentEmployee.id, employees: demoEmployees, policy: authorization, roles: responsibilities, routing: testRoutingError ? null : testRouting, teams: labTeamsError ? null : labTeams } : null;
  // Drafts are shown only to job creators, their author and the administrator, in every list and direct link.
  const visibleJobs = opsActor ? jobs.filter((item) => canSeeDraft(item, opsActor)) : [];
  const progressById = new Map<string, JobProgress>(jobs.map((item) => [item.id, jobProgress(item)]));
  const prog = (item: JobRecord) => progressById.get(item.id) || jobProgress(item);
  const isClosed = (item: JobRecord) => prog(item).closed;
  const myJobs = currentEmployee ? visibleJobs.filter((item) => item.jobResponsibleId === currentEmployee.id || item.responsibleId === currentEmployee.id || (!isDraft(item) && samplingTeam(item).includes(currentEmployee.id)) || (item.report?.reportStatus === "Awaiting Approval" && item.report.approvedBy === currentEmployee.id)) : [];
  const myActiveJobs = myJobs.filter((item) => item.status !== "Completed");
  const myCompletedJobs = visibleJobs.filter((item) => item.ownerId === currentEmployee?.id && isClosed(item));
  const myActivities = currentEmployee ? activities.filter((item) => item.employeeId === currentEmployee.id) : [];
  const today = localDate();
  const activeJobs = visibleJobs.filter((item) => !isClosed(item));
  const samplingJobs = activeJobs.filter((item) => item.currentStage.startsWith("Sampling"));
  const pendingReports = activeJobs.filter((item) => item.currentStage === "Report Preview" || item.status === "Report Draft" || item.status === "Awaiting Approval");
  // Sampling queue: assigned work first; drafts never appear.
  const samplingJobsAll = visibleJobs.filter((item) => item.samplingSource && !isDraft(item) && (item.operations?.dispatchedAt || item.operations || item.samples?.length));
  const mySamplingWork = currentEmployee ? samplingJobsAll.filter((item) => { const status = samplingStatus(item, responsibilities); return status.key !== "report-approved" && (samplingTeam(item).includes(currentEmployee.id) || (status.owner === currentEmployee.id && ["data-review", "report-review", "report-generation", "returned"].includes(status.key))); }) : [];
  const samplingOverview = [...samplingJobsAll].sort((a, b) => (b.lastUpdatedAt || "").localeCompare(a.lastUpdatedAt || ""));
  /** In-app indicator events for the signed-in employee, keyed by the shared record so each event is flagged once. */
  const samplingEvents = (item: JobRecord): string[] => {
    if (!currentEmployee) return [];
    const me = currentEmployee.id, data = latestData(item), report = latest(item.operations?.samplingReports || []), events: string[] = [];
    if (samplingTeam(item).includes(me) && item.operations?.dispatchedAt) events.push(`assign:${item.id}:${item.operations.dispatchedAt}`);
    if (data?.status === "Returned" && samplingTeam(item).includes(me)) events.push(`return:${item.id}:${data.version}`);
    if (data?.status === "Submitted" && samplingApprover === me) events.push(`review:${item.id}:${data.version}`);
    if (report?.status === "Awaiting Approval" && samplingApprover === me) events.push(`report:${item.id}:${report.version}`);
    return events;
  };
  const unseenEvents = (item: JobRecord) => samplingEvents(item).filter((key) => !(seenSampling[currentEmployee?.id || ""] || []).includes(key));
  /** Laboratory indicator events for the signed-in employee: new assignment, returned work and items awaiting their review. */
  const labEvents = ({ a }: { job: JobRecord; a: ActivityRecord }): string[] => {
    if (!currentEmployee) return [];
    const me = currentEmployee.id, v = a.files.length, events: string[] = [];
    const assignedAt = [...(a.history || [])].reverse().find((h) => h.to === me)?.at || a.start;
    if (a.owner === me && a.status !== "Completed") events.push(`lab:assign:${a.id}:${assignedAt}`);
    if (a.owner === me && a.status === "Changes Requested") events.push(`lab:return:${a.id}:${v}`);
    const lead = roleHolder(responsibilities, streamLead(a.stream), demoEmployees);
    if (lead === me && a.status === "Workbook Submitted") events.push(`lab:review:${a.id}:${v}`);
    if (lead === me && a.status === "QC Returned") events.push(`lab:qcret:${a.id}:${v}`);
    if (roleHolder(responsibilities, "qcReviewer", demoEmployees) === me && a.status === "Awaiting QC") events.push(`lab:qc:${a.id}:${v}`);
    return events;
  };
  const labItemsVisible = visibleJobs.filter((item) => !isDraft(item)).flatMap((job) => operationsFor(job).activities.filter((a) => a.required).map((a) => ({ job, a })));
  const unseenLab = (item: { job: JobRecord; a: ActivityRecord }) => labEvents(item).filter((key) => !(seenSampling[currentEmployee?.id || ""] || []).includes(key));
  const labUnseen = labItemsVisible.reduce((count, item) => count + unseenLab(item).length, 0);
  const samplingUnseen = samplingJobsAll.reduce((count, item) => count + unseenEvents(item).length, 0);
  const samplingActionLabel = (item: JobRecord) => ({ draft: "Open job", preparation: "Start preparation", data: "Continue sampling data", "data-review": "Review sampling data", returned: "Correct returned work", "report-generation": "Sampling report", "report-review": "Review report", "report-approved": "Open job" } as Record<string, string>)[samplingStatus(item, responsibilities).key];
  const reportsWorkspaceJobs = visibleJobs.filter((item) => item.operations?.samplingReports.length || item.report?.preparedBy || item.report?.summary);
  const actionsFor = (item: JobRecord) => opsActor && !isClosed(item) ? pendingActions(item, opsActor) : [];
  const registerStage = (item: JobRecord) => isDraft(item) ? "Job creation (draft)" : prog(item).current?.label || "Closed";
  const registerStages = [...new Set(visibleJobs.map(registerStage))];
  const registerCounts = { mine: visibleJobs.filter((item) => actionsFor(item).length > 0).length, active: visibleJobs.filter((item) => !isClosed(item) && !isDraft(item)).length, drafts: visibleJobs.filter(isDraft).length, completed: visibleJobs.filter(isClosed).length, all: visibleJobs.length };
  const filteredJobsRegister = visibleJobs.filter((item) => {
    const matchesFilter = jobsRegisterFilter === "all" || (jobsRegisterFilter === "mine" && actionsFor(item).length > 0) || (jobsRegisterFilter === "active" && !isClosed(item) && !isDraft(item)) || (jobsRegisterFilter === "drafts" && isDraft(item)) || (jobsRegisterFilter === "completed" && isClosed(item));
    const search = jobsRegisterSearch.trim().toLowerCase();
    const normalizedSearch = search.replace(/[^a-z0-9]/g, "");
    const searchableValues = [item.id, item.jobNumber, item.clientCode, item.clientName, item.fieldArea, item.well, ...(item.wells || []), item.clientFocalPoint, item.clientFocalPointEmail, item.clientReference, item.description, item.samplingSource, registerStage(item), item.status, employeeName(item.ownerId), employeeName(item.jobResponsibleId || item.responsibleId), ...samplingTeam(item).map(employeeName), employeeName(item.assignedDriverId)];
    const matchesSearch = !search || searchableValues.some((value) => {
      const text = value?.toLowerCase() || "";
      return text.includes(search) || (normalizedSearch && text.replace(/[^a-z0-9]/g, "").includes(normalizedSearch));
    });
    return matchesFilter && matchesSearch && (!jobsRegisterStage || registerStage(item) === jobsRegisterStage);
  });
  const workflowJob = visibleJobs.find(item => item.id === workflowJobId);
  const selectedJobDetails = hasPermission("jobDetails") && visibleJobs.find((item) => item.id === selectedJobDetailsId);
  const overdueTasks = activeJobs.filter((item) => item.dueDate && item.dueDate < today);
  const dueSoonLimit = addDays(today, 7);
  const dashboardFilteredByType = dashboardFilter === "sampling" ? myActiveJobs.filter((item) => item.currentStage.startsWith("Sampling")) : dashboardFilter === "reports" ? myActiveJobs.filter((item) => item.currentStage === "Report Preview" || item.status === "Report Draft" || item.status === "Awaiting Approval") : dashboardFilter === "due" ? myActiveJobs.filter((item) => item.dueDate && item.dueDate <= dueSoonLimit) : myActiveJobs;
  const dashboardSearchTerm = dashboardSearch.trim().toLowerCase();
  const normalizedDashboardSearch = dashboardSearchTerm.replace(/[^a-z0-9]/g, "");
  const filteredMyJobs = dashboardFilteredByType.filter((item) => !dashboardSearchTerm || [item.id, item.clientName, ...locationParts(item)].some((value) => {
    const text = value.toLowerCase();
    return text.includes(dashboardSearchTerm) || (normalizedDashboardSearch && text.replace(/[^a-z0-9]/g, "").includes(normalizedDashboardSearch));
  }));
  const dashboardDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const dashboardShortDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const progressFor = (item: JobRecord) => prog(item).percent;
  const displayStatus = (item: JobRecord) => prog(item).statusLabel;
  const statusTone = (item: JobRecord) => prog(item).tone;
  const stageOwner = (item: JobRecord) => { const current = prog(item).current; if (!current) return employeeName(item.jobResponsibleId || item.responsibleId); return current.owner && demoEmployees.some((employee) => employee.id === current.owner) ? employeeName(current.owner) : current.ownerFallback; };
  const isOverdue = (item: JobRecord) => !isClosed(item) && Boolean(item.dueDate && item.dueDate < today);
  const attentionJobs = activeJobs.filter((item) => item.dueDate && item.dueDate <= addDays(today, 3) || item.currentStage === "Report Preview" || item.nextAction.toLowerCase().includes("sample"));
  const overviewStages = [
    { name: "Job Setup", count: activeJobs.filter((item) => item.currentStage === "Job Setup" || item.currentStage === "Sampling Decision").length },
    { name: "Sampling", count: samplingJobs.length },
    { name: "Scope of Work", count: 0 },
    { name: "Laboratory Analysis", count: activeJobs.filter((item) => prog(item).current?.id === "lab").length },
    { name: "Reporting", count: pendingReports.length },
    { name: "QC", count: 0 },
    { name: "Closed", count: jobs.filter(isClosed).length },
  ];

  function persistJobs(next: JobRecord[]) {
    const refs=(j:JobRecord)=>[j.responsibleId,j.jobResponsibleId,j.assignedEngineerId,j.assignedDriverId,...j.stages.map(s=>s.assignedTo),...Object.values(j.teamWork||{}).map(t=>t.owner),...Object.values(j.labPlan?.assignees||{}),j.report?.preparedBy];
    for(const item of next) {const old=jobs.find(j=>j.id===item.id);const previous=old?refs(old):[];if(refs(item).some(id=>id&&!previous.includes(id)&&!demoEmployees.some(e=>e.id===id&&e.active))) throw Error('New assignments require an active employee.');}

    const tracked = next.map(item => {
      const reconciled = item.operations ? item : reconcileLabScope(item);
      const task = reconciled.teamWork?.analysis;
      if (task?.completedAt && !labComplete(reconciled)) {
        reconciled.teamWork = {...reconciled.teamWork, analysis: {...task, completedAt: undefined}};
      }
      return trackChanges(reconciled, jobs.find(previous => previous.id === item.id));
    });
    try { window.localStorage.setItem(jobsStorageKey, JSON.stringify(tracked)); } catch { setNotice("The job could not be saved. Browser storage may be full. Your entered information is still available; retry after freeing space."); throw Error("Job save failed. No stored records were changed."); }
    setJobs(tracked);
    for (const item of tracked) { void syncShare(item).catch(() => setNotice("Job saved on this device, but its shared summary could not be updated. Open Workflow and choose Update shared summary to retry.")); }
  }

  function resumeJob(item: JobRecord, navigate=true) {
    if(navigate)setEditorRoute([]);
    if (!hasPermission("jobDetails")) { setNotice("You do not have access to job details."); return; }
    setClient(item.clientCode);
    setCreatedJobId(item.id);
    setJob({
      ...emptyJobDetails(),
      countryCode: item.countryCode || item.id.split("-")[0] || "OM",
      dateReceived: item.dateReceived || localDate(),
      fieldArea: item.fieldArea || "",
      employee: item.jobResponsibleId || item.responsibleId,
      assignedEngineerId: item.assignedEngineerId || item.responsibleId || "",
      assignedDriverId: item.assignedDriverId || "",
      requestedSampleCount: item.requestedSampleCount || String(item.samples?.length || 3),
      samplingInstructions: item.samplingInstructions || "",
      samplingTeamIds: item.samplingTeamIds || [],
      requiredTests: item.requiredTests || [],
      otherTests: item.otherTests || "",
      sampleCountNotes: item.sampleCountNotes || "",
      clientFocalPoint: item.clientFocalPoint || "",
      clientFocalPointContact: item.clientFocalPointContact || "",
      clientFocalPointEmail: item.clientFocalPointEmail || item.clientReference || "",
      dueDate: item.dueDate || "",
      description: item.description || "",
      well: item.well || "",
      wellMode: item.wellMode || ((item.wells?.length || 0) > 1 ? "multiple" : "single"),
      wells: item.wells?.length ? item.wells : [item.well || ""],
      rigInstallation: item.rigInstallation || "",
      plannedDepth: item.plannedDepth || "",
      formation: item.formation || "",
      perforationInterval: item.perforationInterval || "",
      wellheadLocation: item.wellheadLocation || "",
      chokeSize: item.chokeSize || "",
      whp: item.whp || "",
      wht: item.wht || "",
      facility: item.facility || "",
      separatorId: item.separatorId || "",
      separatorStage: item.separatorStage || "",
      samplingPoint: item.samplingPoint || "",
      separatorPressure: item.separatorPressure || "",
      separatorTemperature: item.separatorTemperature || "",
      relatedWell: item.relatedWell || "",
      locationNotes: item.locationNotes || "",
      otherDescription: item.otherDescription || "",
      otherSamplingType: item.otherSamplingType || "",
      oilRate: item.oilRate || "",
      gasRate: item.gasRate || "",
      waterRate: item.waterRate || "",
    });
    const storedSource = item.samplingSource as string | undefined;
    const normalizedSource: SamplingSource | "" = storedSource === "Bottomhole / Downhole Sampling"
      ? item.holeType === "Open Hole" ? "Open Hole (MPSR - Lab Transfer)" : "Cased Hole (Bottomhole / Downhole Sampling)"
      : storedSource === "Open Hole (MDT Transfer)" ? "Open Hole (MPSR - Lab Transfer)" : (item.samplingSource || "");
    setSamplingRequired(item.samplingRequired ?? (normalizedSource ? samplingIsRequired(normalizedSource) : null));
    setSamplingType(normalizedSource);
    setHoleType(item.holeType || "");
    setScopeAttachment(item.scopeOfWorkAttachment || null);
    const loadedSamples = item.samples || [];
    setSamples(isSpmcFieldSampling(normalizedSource) && loadedSamples.length ? loadedSamples.map((sample) => ({ ...sample, sampler: "SPMC", samplerSerial: loadedSamples[0].samplerSerial, calibrationStatus: loadedSamples[0].calibrationStatus, pressureTestStatus: loadedSamples[0].pressureTestStatus, equipmentCondition: loadedSamples[0].equipmentCondition })) : loadedSamples);
    setEvents(item.events || []);
    setCoordinationTasks(createCoordinationTasks(normalizedSource, item.coordinationTasks || []));
    setCoordinationDetails({ ...emptyCoordinationDetails(), ...(item.coordinationDetails || {}) });
    // Only completed reports keep an approver: the recorded signature. A pending approver is resolved from Settings at the time of action.
    setReport(item.report ? { ...item.report, approvedBy: item.report.reportStatus === "Completed" ? item.report.approvedBy : "" } : { summary: "", preparedBy: "", preparedDate: "", approvedBy: "", approvalDate: "", reportStatus: "Draft" });
    const nextStage: Stage = item.currentStage === "Sampling Decision" ? (normalizedSource ? "type" : "job") : item.currentStage === "Sampling Preparation" ? "type" : item.currentStage === "Sampling Data" ? "bottomhole" : item.currentStage === "Report Preview" ? "report" : item.currentStage === "Final Report" || item.status === "Completed" || item.currentStage === "Scope of Work" ? "scope" : "job";
    setStage(nextStage);
    if(navigate)setWorkspaceView("new-job");
    setExpandedDashboardJob("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // Opening a #new-job/<id> link restores that draft into the editor state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(!authReady||!currentEmployee)return;if(workspaceView==='new-job'&&editorRoute[0]&&createdJobId!==decodeURIComponent(editorRoute[0])){const saved=visibleJobs.find(j=>j.id===decodeURIComponent(editorRoute[0]));if(!saved){setNotice('Job not found or not available to your profile.');setEditorRoute([]);location.replace('#jobs');}else{resumeJob(saved,false);const [target,query]=(editorRoute[1]||'').split('?');if(['job','type','bottomhole','scope','report'].includes(target))setStage(target as Stage);const sample=new URLSearchParams(query||'').get('sample');if(sample)setExpanded(sample);}}},[authReady,currentEmployee?.id,workspaceView,editorRoute,jobs]);
  useEffect(()=>{if(workspaceView==='workflow'&&workflowJobId&&location.hash==='#workflow')history.replaceState(null,'','#workflow/'+encodeURIComponent(workflowJobId)+'/overview');if(workspaceView==='new-job'&&createdJobId&&currentJob)history.replaceState(null,'','#new-job/'+encodeURIComponent(createdJobId)+'/'+stage);},[workspaceView,workflowJobId,createdJobId,stage,currentJob]);

  const labTeam = demoEmployees.map((employee) => ({ id: employee.id, name: employee.name, active: employee.active && eligibleForTeam(employee.id, "analysis") }));
  const canPlanLab = (_item: JobRecord) => Boolean(!_item.operations && hasPermission("analysis") && currentEmployee && (coordinator(currentEmployee.id) || labTeam.some((member) => member.id === currentEmployee.id && member.active)));
  const labLockReason = (item: JobRecord, labItem: LabItem) => {
    if(item.operations)return "Use the connected job activities; this plan is a historical record.";
    if (!currentEmployee || !hasPermission("analysis")) return "You do not have access to PVT analysis.";
    if (!item.teamWork?.transport?.completedAt) return "Progress can be recorded once the samples are delivered to the laboratory.";
    if (labItem.assignee !== currentEmployee.id && item.teamWork?.analysis?.owner !== currentEmployee.id) return `Only ${labItem.assignee ? employeeName(labItem.assignee) : "the assigned person"} or the accepted PVT owner can update this item.`;
    return "";
  };

  /** Open the work area for a job's stage (defaults to its current stage). */
  function openStage(item: JobRecord, stageId?: StageId | "closed") {
    if(item.operations){openOperation(item,stageId==="lab"?"laboratory":stageId==="delivery"?"handover":stageId==="sampling"?"sampling":stageId==="setup"?"overview":stageId==="planning"?"scope":stageId==="sampling-report"?"sampling-report":stageId==="reporting"?"reporting":"overview");return;}
    const target = stageId || prog(item).current?.id || "closed";
    if (!hasPermission(target === "lab" ? "analysis" : target === "sampling" ? "sampling" : "jobDetails")) { setNotice("You do not have access to this work area."); return; }
    if (target === "lab") { setLabJobId(item.id); setWorkspaceView("pvt-lab"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (target === "setup") { resumeJob(item); setStage("job"); return; }
    if (target === "sampling") {
      const stages = prog(item).stages.find((stage) => stage.id === "sampling");
      const next = stages?.tasks.find((task) => task.state !== "done");
      resumeJob(item);
      if (next?.id === "sampling:report") setStage("report");
      return;
    }
    setWorkflowJobId(item.id); setWorkspaceView("workflow"); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function persistActivities(next: Activity[]) {
    setActivities(next);
    window.localStorage.setItem(activityStorageKey, JSON.stringify(next));
  }

  function recordActivity(action: string, targetJobId = jobId, timestamp = new Date().toISOString()) {
    if (!currentEmployee) return;
    const next = [{ id: newActivityId(), employeeId: currentEmployee.id, action, jobId: targetJobId, timestamp }, ...activities].slice(0, 80);
    persistActivities(next);
  }

  /** Saves the editor state. With send, the job is dispatched to Sampling against freshly read settings; a refusal throws. */
  function updateCurrentJob(nextStage: string, nextAction: string, stageUpdates: Record<string, WorkflowStatus> = {}, action?: string, recordUpdates: Partial<JobRecord> = {}, send = false) {
    if (!currentEmployee) return;
    if ((!currentJob || isDraft(currentJob)) && !hasPermission("createJob")) { setNotice("You are not authorized to create jobs."); return; }
    if (currentJob && (!hasPermission("jobDetails") || (stage !== "job" && !hasPermission("sampling")))) { setNotice("You do not have access to update this work area."); return; }
    if(currentJob && !coordinator(currentEmployee.id) && !samplingTeam(currentJob).includes(currentEmployee.id) && !canWork(currentJob,"sampling",currentEmployee.id)){setNotice("Only the accepted sampling owner or a job coordinator can update this job workspace.");return;}
    if(currentJob && stage !== "job" && samplingDataLocked(currentJob)){setNotice(latestData(currentJob)?.status==="Submitted"?"The sampling data is submitted for review and is read-only until it is returned.":"The sampling data is approved and read-only. To correct it, reopen it with a reason in Sampling review & report.");return;}
    if(currentJob?.operations?.samplingReports.some(r=>["Checking","Awaiting Approval","Approved"].includes(r.status)) && !["Draft","Changes Requested"].includes(currentJob.operations.samplingReports.at(-1)!.status)){setNotice("Submitted sampling data is locked. Request a report revision before editing.");return;}
    if (!currentJob?.operations && currentJob?.report?.reportStatus !== "Draft" && currentJob?.report && !(currentEmployee.id === samplingApprover && currentJob.report.reportStatus === "Awaiting Approval" && recordUpdates.report)) { setNotice(`Reviewed data is locked. ${employeeName(samplingApprover)} must request changes before editing.`); return; }
    if(currentJob?.operations && (JSON.stringify(job.requiredTests)!==JSON.stringify(currentJob.requiredTests||[]) || job.otherTests!==(currentJob.otherTests||''))){setNotice('The original request is preserved. Record scope changes in Scope → Request additional work, with a reason.');return;}
    const now = new Date().toISOString();
    const responsibleId = job.assignedEngineerId || currentJob?.responsibleId || job.employee || currentEmployee.id;
    const jobFields = {
      jobResponsibleId: job.employee || currentJob?.jobResponsibleId || currentJob?.responsibleId || currentEmployee.id,
      requestedSampleCount: job.requestedSampleCount, samplingInstructions: job.samplingInstructions, samplingTeamIds: job.samplingTeamIds.filter(id => id && id !== job.assignedEngineerId), requiredTests: job.requiredTests, otherTests: job.otherTests, sampleCountNotes: job.sampleCountNotes,
      countryCode: job.countryCode, dateReceived: job.dateReceived, description: job.description, assignedEngineerId: job.assignedEngineerId, assignedDriverId: job.assignedDriverId, clientFocalPoint: job.clientFocalPoint, clientFocalPointContact: job.clientFocalPointContact, clientFocalPointEmail: job.clientFocalPointEmail, fieldArea: job.fieldArea, well: job.well, wellMode: job.wellMode, wells: job.wells, rigInstallation: job.rigInstallation,
      plannedDepth: job.plannedDepth, formation: job.formation, perforationInterval: job.perforationInterval, wellheadLocation: job.wellheadLocation,
      chokeSize: job.chokeSize, whp: job.whp, wht: job.wht, facility: job.facility, separatorId: job.separatorId, separatorStage: job.separatorStage,
      samplingPoint: job.samplingPoint, separatorPressure: job.separatorPressure, separatorTemperature: job.separatorTemperature, relatedWell: job.relatedWell,
      locationNotes: job.locationNotes, otherDescription: job.otherDescription, otherSamplingType: job.otherSamplingType, oilRate: job.oilRate, gasRate: job.gasRate, waterRate: job.waterRate,
    };
    const base: JobRecord = currentJob ?? {
      id: jobId, globalSequence: nextSequence, jobNumber: jobId, clientCode: client, clientName, ...jobFields, dueDate: job.dueDate,
      status: "Job Created" as const, currentStage: "Job Setup", nextAction: "Complete sampling preparation",
      ownerId: currentEmployee.id, responsibleId, createdById: currentEmployee.id, createdAt: now,
      lastUpdatedById: currentEmployee.id, lastUpdatedAt: now,
      stages: workflowStageNames.map((name) => ({ name, assignedTo: responsibleId, status: name === "Job Setup" ? "In Progress" as const : "Not Started" as const })),
    };
    const stages = base.stages.map((item) => {
      const nextStatus = stageUpdates[item.name];
      if (!nextStatus) return item;
      return {
        ...item,
        assignedTo: responsibleId,
        status: nextStatus,
        started: item.started || (nextStatus === "In Progress" || nextStatus === "Completed" ? now : undefined),
        completed: nextStatus === "Completed" ? now : undefined,
        lastUpdatedBy: currentEmployee.id,
        lastUpdatedAt: now,
      };
    });
    const automaticStatus: JobStatus = nextStage === "Sampling Preparation" ? "Sampling In Progress" : nextStage === "Sampling Data" ? "Sampling In Progress" : nextStage === "Report Preview" ? "Report Draft" : nextStage === "Final Report" && stageUpdates["Final Report"] === "Completed" ? (labComplete(base) ? "Completed" : "Sampling Completed") : base.status;
    let updated: JobRecord = { ...base, ...(!currentJob || coordinator(currentEmployee.id) ? jobFields : {}), ...(samplingRequired !== null ? { samplingRequired } : {}), ...(samplingType ? { samplingSource: samplingType } : {}), holeType, ...(scopeAttachment ? { scopeOfWorkAttachment: scopeAttachment } : {}), samples, events, report, coordinationTasks, coordinationDetails, ...recordUpdates, clientName, dueDate: job.dueDate, currentStage: nextStage, nextAction, status: recordUpdates.status || automaticStatus, lastUpdatedById: currentEmployee.id, lastUpdatedAt: now, stages };
    if(send){updated=applyOperation(updated,{type:'dispatch',engineer:job.assignedEngineerId,driver:job.assignedDriverId,team:job.samplingTeamIds},freshActor(),now);}
    if(!currentJob){const stored:JobRecord[]=JSON.parse(localStorage.getItem(jobsStorageKey)||'[]');if(stored.some(item=>item.id===updated.id))throw Error(`Job ID ${updated.id} is already in use. Refresh and try again; nothing was saved.`);}
    if(currentJob?.operations && currentJob.report?.reportStatus==="Completed")updated.report=currentJob.report;
    if(updated.operations && !operationComplete(updated) && updated.status==="Completed") updated.status="Sampling Completed";
    persistJobs(jobs.some((item) => item.id === jobId) ? jobs.map((item) => item.id === jobId ? updated : item) : [updated, ...jobs]);
    if (action) recordActivity(action, jobId, now);
  }

  function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    const id = loginForm.id.trim().toUpperCase();
    const employee = demoEmployees.find((item) => item.active && item.password && item.id === id && item.password === loginForm.password);
    if (!employee) {
      setLoginError("Employee ID or password is incorrect. Please try again.");
      return;
    }
    window.sessionStorage.setItem(sessionStorageKey, employee.id);
    setCurrentEmployee(employee);
    if (!location.hash || location.hash==="#dashboard") setWorkspaceView("dashboard");
    setLoginForm({ id: "", password: "" });
    setLoginError("");
  }

  function logout() {
    if(window.confirmSettingsLeave && !window.confirmSettingsLeave()) return;
    window.sessionStorage.removeItem(sessionStorageKey);
    setCurrentEmployee(null);
    setUserMenuOpen(false);
    setLoginForm({ id: "", password: "" });
  }

  function startNewJob() {
    setEditorRoute([]);
 if(!hasPermission("createJob")){setNotice("You are not authorized to create jobs.");return;}
    setDispatchReview(false);
    setWorkspaceView("new-job");
    setStage("job");
    setCreatedJobId("");
    setSamplingRequired(null);
    setSamplingType("");
    setHoleType("");
    setScopeAttachment(null);
    setSamples([]);
    setExpanded("");
    setPreparationStartedAt("");
    setPreparationCompletedAt("");
    setPreparationNotes("");
    setPreparationError([]);
    setCoordinationTasks([]);
    setCoordinationDetails(emptyCoordinationDetails());
    setSampleDataErrors({});
    setSamplingDataCompletedAt("");
    setEvents([]);
    setEventDraft({ date: localDate(), time: "", description: "" });
    setNotice("");
    setJobErrors([]);
    setReport({ summary: "", preparedBy: "", preparedDate: "", approvedBy: "", approvalDate: "", reportStatus: "Draft" });
    setReportErrors([]);
    setJob({...emptyJobDetails(),employee:currentEmployee!.id});
  }

  function updateJob(field: keyof typeof job, value: string) {
    setDispatchReview(false);
    setJob((current) => ({ ...current, [field]: value }));
  }

  function selectWellMode(mode: "single" | "multiple") {
    setJob((current) => {
      const existing = current.wells.map((well) => well.trim()).filter(Boolean);
      if (mode === "single") {
        const firstWell = existing[0] || current.well.split(",")[0]?.trim() || "";
        return { ...current, wellMode: mode, wells: [firstWell], well: firstWell };
      }
      const nextWells = existing.length ? [...existing] : current.well.trim() ? [current.well.trim()] : [""];
      if (nextWells.length < 2) nextWells.push("");
      return { ...current, wellMode: mode, wells: nextWells, well: nextWells.filter((well) => well.trim()).join(", ") };
    });
    setJobErrors([]);
  }

  function updateWell(index: number, value: string) {
    setJob((current) => {
      const nextWells = current.wells.map((well, wellIndex) => wellIndex === index ? value : well);
      return { ...current, wells: nextWells, well: nextWells.map((well) => well.trim()).filter(Boolean).join(", ") };
    });
    setJobErrors([]);
  }

  function addWell() {
    setJob((current) => ({ ...current, wells: [...current.wells, ""] }));
  }

  function removeWell(index: number) {
    setJob((current) => {
      if (current.wells.length <= 2) return current;
      const nextWells = current.wells.filter((_, wellIndex) => wellIndex !== index);
      return { ...current, wells: nextWells, well: nextWells.map((well) => well.trim()).filter(Boolean).join(", ") };
    });
  }

  function attachScopeOfWork(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setScopeAttachment({ name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  function addSample() {
    setSamples((current) => {
      const nextNumber = current.reduce((maximum, sample) => Math.max(maximum, Number(sample.id.split(".")[1]) || 0), 0) + 1;
      return [...current, { ...emptySamples()[0], id: `1.${String(nextNumber).padStart(2, "0")}`, sampler: isSpmcFieldSampling(samplingType) ? "SPMC" : isCasedHoleSampling(samplingType) ? "SPS" : "", bottle: "PDS" }];
    });
  }

  function removeSample(id: string) {
    setSamples((current) => current.filter((sample) => sample.id !== id));
    setExpanded((current) => current === id ? "" : current);
  }

  function deterministicSummary() {
    return samplingSummary({ clientName, samplingSource: samplingType, well: job.well, samples, jobNumber: jobId });
  }

  function missingReportFields() {
    const errors: string[] = [];
    if (!jobId) errors.push("Job number is missing.");
    if (!clientName) errors.push("Client is missing.");
    if (!job.fieldArea.trim()) errors.push("Field is missing.");
    if (!job.well.trim()) errors.push("Well is missing.");
    if (!samplingType) errors.push("Sampling type is missing.");
    if (!samples.length) errors.push("At least one sample record is required.");
    samples.forEach((sample) => {
      const sheetErrors = standardDataSheetErrors(sample);
      if (!sample.dataComplete || sheetErrors.length) errors.push(`Sample ${sample.id}: complete and confirm the standard Sample Data Sheet.`);
    });
    if (!report.summary.trim()) errors.push("Report summary is required.");
    if (!report.preparedBy) errors.push("Prepared By is required.");
    if (!report.preparedDate) errors.push("Prepared Date is required.");
    if (!samplingApprover) errors.push("Sampling approval is not configured. Ask an administrator to assign it in Settings → Authorization.");
    return errors;
  }

  function saveReportDraft() {
    if (report.reportStatus !== "Draft") return;
    const nextReport = { ...report, reportStatus: "Draft" as const };
    setReport(nextReport);
    updateCurrentJob("Report Preview", "Complete report review and approval", { "Report Preview": "In Progress" }, undefined, { samples, events, report: nextReport, status: "Report Draft" });
    setNotice("Sampling report draft saved to local demo data");
  }

  function submitReportForApproval() {
    if(currentJob){openOperation(currentJob,"sampling-report");return;}
    if (report.reportStatus !== "Draft") return;
    const errors = missingReportFields();
    setReportErrors(errors);
    if (errors.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!currentEmployee) return;
    const now = new Date().toISOString();
    const nextReport = { ...report, approvedBy: "", approvalDate: "", reportStatus: "Awaiting Approval" as const, submittedBy: currentEmployee.id, submittedAt: now, approvedAt: undefined };
    setReport(nextReport);
    updateCurrentJob("Report Preview", `Approval required from ${employeeName(samplingApprover)}`, { "Report Preview": "In Progress", "Final Report": "Not Started" }, `submitted Sampling and Analysis Report for approval to ${employeeName(samplingApprover)}`, { samples, events: sortedEvents, report: nextReport, status: "Awaiting Approval", responsibleId: samplingApprover });
    setNotice(`Report sent to ${employeeName(samplingApprover)} for approval`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function approveFinalReport() {
    if(currentJob?.operations){openOperation(currentJob,"sampling-report");return;}
    if (!currentJob || JSON.stringify(samples) !== JSON.stringify(currentJob.samples) || JSON.stringify(events) !== JSON.stringify(currentJob.events) || report.summary !== currentJob.report?.summary) { setNotice("The review data has changed. Reload the job and review the submitted data before approval."); return; }
    // The configured sampling approver acts now; the approval records who actually signed.
    if (!currentEmployee || !samplingApprover || currentEmployee.id !== samplingApprover || !hasPermission("sampling") || report.reportStatus !== "Awaiting Approval") {
      setNotice(samplingApprover ? `Only ${employeeName(samplingApprover)} (sampling approval) can approve this report.` : "Sampling approval is not configured. Ask an administrator to assign it in Settings → Authorization.");
      return;
    }
    const errors = missingReportFields();
    setReportErrors(errors);
    if (errors.length) return;
    const now = new Date().toISOString();
    const nextReport = { ...report, approvedBy: currentEmployee.id, approvalDate: now.slice(0, 10), approvedAt: now, reportStatus: "Completed" as const };
    setReport(nextReport);
    updateCurrentJob("Final Report", "No action required", { "Report Preview": "Completed", "Final Report": "Completed" }, `approved final Sampling and Analysis Report for ${jobId}`, { samples, events: sortedEvents, report: nextReport, status: currentJob && !labComplete(currentJob) ? "Sampling Completed" : "Completed" });
    setNotice("Sampling and Analysis Report approved and finalized");
    setStage("scope");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestReportChanges() {
    if(currentJob?.operations){openOperation(currentJob,"sampling-report");return;}
    if (!currentEmployee || !samplingApprover || currentEmployee.id !== samplingApprover || !hasPermission("sampling") || report.reportStatus !== "Awaiting Approval") {
      setNotice(samplingApprover ? `Only ${employeeName(samplingApprover)} (sampling approval) can return this report.` : "Sampling approval is not configured.");
      return;
    }
    const nextReport = { ...report, approvalDate: "", approvedAt: undefined, reportStatus: "Draft" as const };
    setReport(nextReport);
    updateCurrentJob("Report Preview", "Revise report and resubmit for approval", { "Report Preview": "In Progress", "Final Report": "Not Started" }, `requested changes to Sampling and Analysis Report for ${jobId}`, { report: nextReport, status: "Report Draft", responsibleId: report.preparedBy || currentJob?.ownerId || currentEmployee.id });
    setNotice("Report returned to the preparer for changes");
  }

  async function downloadReportPdf() {
    if (report.reportStatus !== "Completed" || !report.approvedBy || !report.approvedAt) return;
    const reportElement = document.querySelector<HTMLElement>("[data-pdf-report]");
    if (!reportElement || pdfExporting) return;
    setPdfExporting(true);
    setNotice("Preparing the report PDF...");
    reportElement.classList.add("pdf-export-mode");
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf().set({
        margin: 0,
        filename: `${jobId}-Sampling-and-Analysis-Report.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(reportElement).save();
      setNotice(`Downloaded ${jobId}-Sampling-and-Analysis-Report.pdf`);
    } catch {
      setNotice("The PDF could not be created. Please try again.");
    } finally {
      reportElement.classList.remove("pdf-export-mode");
      setPdfExporting(false);
    }
  }

  const sortedEvents = [...events].sort((left, right) => `${left.date || ""}T${left.time}`.localeCompare(`${right.date || ""}T${right.time}`));
  const reportDate = (value?: string) => {
    if (!value) return "-";
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
  };
  const reportTotalPages = 4 + samples.length;
  const sampleReportValue = (sample: Sample, field: string, unitField?: string) => {
    const value = sample.fieldData[field]?.trim();
    if (!value) return "Not recorded";
    if (value.toUpperCase() === "N/A") return "N/A";
    const unit = unitField ? sample.fieldData[unitField]?.trim() : "";
    return unit ? `${value} ${unit}` : value;
  };

  function updateSampleFieldData(id: string, field: string, value: string) {
    setSamples((current) => current.map((sample) => sample.id === id ? {
      ...sample,
      depth: field === "depth" ? value : sample.depth,
      notes: field === "notes" ? value : sample.notes,
      fieldData: field === "depth" || field === "notes" ? sample.fieldData : { ...sample.fieldData, [field]: value },
      dataComplete: false,
      dataCompletedBy: "",
      dataCompletedAt: "",
    } : sample));
    setSampleDataErrors((current) => ({ ...current, [id]: [] }));
    if (currentEmployee && !trackedSamples.includes(id)) {
      setTrackedSamples((current) => [...current, id]);
      updateCurrentJob("Sampling Data", "Complete sample records", { "Sampling Data": "In Progress" }, `Entered Sample ${id} data`);
    }
  }

  function sampleDataStatus(sample: Sample) {
    if (sample.dataComplete) return "Complete";
    const started = Boolean(sample.fieldData.samplingDate || sample.fieldData.samplingTime || sample.depth || sample.notes || sample.fieldData.bhp || sample.fieldData.sampleVolume);
    return started ? "In Progress" : "Not Started";
  }

  function samplingTextField(sample: Sample, label: string, field: string, options: { required?: boolean; type?: string; placeholder?: string } = {}): ReactNode {
    const value = field === "depth" ? sample.depth : field === "notes" ? sample.notes : sample.fieldData[field] || "";
    return <label><span>{label}{options.required ? " *" : ""}</span><input type={options.type || "text"} value={value} onBlur={(event) => { if ((options.type === "date" || options.type === "time") && event.currentTarget.value !== value) updateSampleFieldData(sample.id, field, event.currentTarget.value); }} onChange={(event) => updateSampleFieldData(sample.id, field, event.target.value)} placeholder={options.placeholder} /></label>;
  }

  function samplingUnitField(sample: Sample, label: string, field: string, unitField: string, units: string[], options: { required?: boolean; placeholder?: string } = {}): ReactNode {
    const value = field === "depth" ? sample.depth : sample.fieldData[field] || "";
    return <label><span>{label}{options.required ? " *" : ""}</span><div className="value-unit"><input type="text" inputMode="decimal" value={value} onChange={(event) => updateSampleFieldData(sample.id, field, event.target.value)} placeholder={options.placeholder || "Value or N/A"} /><select aria-label={`${label} unit`} value={sample.fieldData[unitField]} onChange={(event) => updateSampleFieldData(sample.id, unitField, event.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></div></label>;
  }

  function samplingSelectField(sample: Sample, label: string, field: string, options: string[]): ReactNode {
    return <label><span>{label}</span><select value={sample.fieldData[field] || options[0]} onChange={(event) => updateSampleFieldData(sample.id, field, event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }

  function standardDataSheetErrors(sample: Sample) {
    return standardSheetErrors(sample);
  }

  function fillBlankConditionsAsNotApplicable(id: string) {
    setSamples((current) => current.map((sample) => sample.id === id ? { ...sample, fieldData: { ...sample.fieldData, ...Object.fromEntries(standardConditionFields.map((field) => [field, sample.fieldData[field]?.trim() || "N/A"])) }, dataComplete: false, dataCompletedBy: "", dataCompletedAt: "" } : sample));
    setSampleDataErrors((current) => ({ ...current, [id]: [] }));
  }

  function standardDataSheetForm(sample: Sample): ReactNode {
    return <>
      <div className="standard-sheet-toolbar"><div><strong>Standard Sample Data Sheet</strong><small>Complete every section. Use N/A only when a condition does not apply.</small></div><button type="button" className="outline-button" onClick={() => fillBlankConditionsAsNotApplicable(sample.id)}>Set blank condition fields to N/A</button></div>
      <section className="data-section identification-section"><header><span>01</span><div><small>REQUIRED SAMPLE CONTEXT</small><h3>Identification</h3></div></header><div className="technical-field-grid">
        {samplingTextField(sample, "Sampling Date", "samplingDate", { required: true, type: "date" })}
        {samplingTextField(sample, "Sampling Time", "samplingTime", { required: true, type: "time" })}
        {samplingTextField(sample, "Sample Nature", "sampleNature", { required: true, placeholder: "e.g. BHS, WHS, separator" })}
        {samplingTextField(sample, "Sampling Point / Depth", "depth", { required: true, placeholder: "Location, point, or measured depth" })}
        {samplingTextField(sample, "Flow Period", "flowPeriod", { required: true, placeholder: "Value or N/A" })}
        {samplingTextField(sample, "Formation", "formation", { required: true, placeholder: "Value or N/A" })}
        {samplingTextField(sample, "Perforations", "perforations", { required: true, placeholder: "Value or N/A" })}
      </div></section>
      <details className="technical-data-section"><summary><div><span>02</span><strong>Shipping Conditions</strong><small>Sample volumes, remaining fluid, and final bottle condition</small></div><b>⌄</b></summary><div className="technical-field-grid">
        {samplingUnitField(sample, "Sample Bottle Volume", "sampleBottleVolume", "sampleBottleVolumeUnit", volumeUnits, { required: true })}{samplingUnitField(sample, "Sample Volume", "sampleVolume", "sampleVolumeUnit", volumeUnits, { required: true })}{samplingUnitField(sample, "Fluid Remaining", "fluidRemaining", "fluidRemainingUnit", volumeUnits, { required: true })}
        {samplingSelectField(sample, "Gas Cap Created", "gasCapCreated", ["Yes", "No", "N/A"])}
        {samplingUnitField(sample, "Final Pressure", "finalPressure", "finalPressureUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Final Temperature", "finalTemperature", "finalTemperatureUnit", temperatureUnits, { required: true })}
      </div></details>
      <details className="technical-data-section"><summary><div><span>03</span><strong>Matched / Transfer Conditions</strong><small>Opening and transfer conditions for the sample and receiving bottle</small></div><b>⌄</b></summary><div className="technical-field-grid">
        {samplingUnitField(sample, "Sample Opening Pressure", "initialOpeningPressure", "initialOpeningPressureUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Sample Opening Temperature", "initialOpeningTemperature", "initialOpeningTemperatureUnit", temperatureUnits, { required: true })}
        {samplingUnitField(sample, "Receiving Bottle Opening Pressure", "receivingBottleOpeningPressure", "receivingBottleOpeningPressureUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Receiving Bottle Opening Temperature", "receivingBottleOpeningTemperature", "receivingBottleOpeningTemperatureUnit", temperatureUnits, { required: true })}
        {samplingUnitField(sample, "Transfer Pressure", "transferPressure", "transferPressureUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Transfer Temperature", "transferTemperature", "transferTemperatureUnit", temperatureUnits, { required: true })}{samplingTextField(sample, "Transfer Duration", "transferDuration", { required: true, placeholder: "e.g. 20 min or N/A" })}
      </div></details>
      <details className="technical-data-section"><summary><div><span>04</span><strong>Production Conditions During Sampling</strong><small>Enter measured values or N/A for every non-applicable condition</small></div><b>⌄</b></summary><div className="technical-field-grid">
        {samplingUnitField(sample, "Bottomhole Pressure (BHP)", "bhp", "bhpUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Bottomhole Temperature (BHT)", "bht", "bhtUnit", temperatureUnits, { required: true })}{samplingUnitField(sample, "Wellhead Pressure (WHP)", "whp", "whpUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Wellhead Temperature (WHT)", "wht", "whtUnit", temperatureUnits, { required: true })}
        {samplingTextField(sample, "Choke Size", "chokeSize", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "Stable Since", "stableSince", { required: true, placeholder: "Date/time or N/A" })}{samplingTextField(sample, "H2S", "h2s", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "CO2", "co2", { required: true, placeholder: "Value or N/A" })}
        {samplingUnitField(sample, "Separator Pressure", "separatorPressure", "separatorPressureUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Separator Temperature", "separatorTemperature", "separatorTemperatureUnit", temperatureUnits, { required: true })}{samplingTextField(sample, "Gas Rate (std)", "gasRate", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "Gas Gravity", "gasGravity", { required: true, placeholder: "Value or N/A" })}
        {samplingUnitField(sample, "Gas Differential Pressure", "gasDifferentialPressure", "gasDifferentialPressureUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Gas Pressure", "gasPressure", "gasPressureUnit", pressureUnits, { required: true })}{samplingUnitField(sample, "Gas Temperature", "gasTemperature", "gasTemperatureUnit", temperatureUnits, { required: true })}{samplingTextField(sample, "Fb Factor", "fbFactor", { required: true, placeholder: "Value or N/A" })}
        {samplingTextField(sample, "Fpv Factor", "fpvFactor", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "Oil Rate", "oilRate", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "Corrected By", "correctedBy", { required: true, placeholder: "Name/reference or N/A" })}{samplingTextField(sample, "Condensate Gravity 60/60", "condensateGravity", { required: true, placeholder: "Value or N/A" })}
        {samplingUnitField(sample, "Oil Line Temperature", "oilLineTemperature", "oilLineTemperatureUnit", temperatureUnits, { required: true })}{samplingTextField(sample, "Water Rate", "waterRate", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "CGR", "cgr", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "WOR", "wor", { required: true, placeholder: "Value or N/A" })}{samplingTextField(sample, "BSW", "bsw", { required: true, placeholder: "Value or N/A" })}
      </div></details>
      <label className="sample-remarks"><span>Remarks</span><textarea rows={4} value={sample.notes} onChange={(event) => updateSampleFieldData(sample.id, "notes", event.target.value)} placeholder="Record the data source, sample condition, observations, or exceptions…" /></label>
    </>;
  }

  function markSampleComplete(id: string) {
    const sample = samples.find((item) => item.id === id);
    if (!sample || !currentEmployee) return;
    const errors: string[] = standardDataSheetErrors(sample);
    if (requiresEquipmentPreparation(samplingType) && (!sample.sampler || !sample.samplerSerial.trim())) errors.push("A prepared sampler reference is required.");
    if (errors.length) {
      setSampleDataErrors((current) => ({ ...current, [id]: errors }));
      setExpanded(id);
      return;
    }
    const now = new Date().toISOString();
    setSampleDataErrors((current) => ({ ...current, [id]: [] }));
    const nextSamples = samples.map((item) => item.id === id ? { ...item, dataComplete: true, dataCompletedBy: currentEmployee.id, dataCompletedAt: now } : item);
    setSamples(nextSamples);
    updateCurrentJob("Sampling Data", "Complete remaining sample records", { "Sampling Data": "In Progress" }, `Completed Sample ${id} data`, { samples: nextSamples });
  }

  const [submissionNote, setSubmissionNote] = useState("");
  function markSamplingSeen(item: JobRecord) { markSeen(samplingEvents(item)); }
  function markSeen(keys: string[]) {
    if (!currentEmployee || !keys.length) return;
    const next = { ...seenSampling, [currentEmployee.id]: [...new Set([...(seenSampling[currentEmployee.id] || []), ...keys])].slice(-500) };
    setSeenSampling(next); try { localStorage.setItem(samplingSeenKey, JSON.stringify(next)); } catch { /* not critical */ }
  }
  function openSamplingTask(item: JobRecord) {
    markSamplingSeen(item);
    const status = samplingStatus(item, responsibilities);
    if (status.tab === "sampling" && hasPermission("sampling") && samplingTeam(item).includes(currentEmployee?.id || "")) { resumeJob(item); setStage(samplingStageFor(item)); return; }
    openOperation(item, status.tab === "sampling" ? "sampling" : status.tab);
  }
  /** Saves the current entries, then submits them for data review against freshly read settings. */
  function submitSamplingData() {
    if (!currentJob || !currentEmployee) return;
    updateCurrentJob(currentJob.currentStage === "Report Preview" ? "Report Preview" : "Sampling Data", "Sampling data review", {}, undefined, { samples, events });
    try {
      runOperation(currentJob.id, { type: "data-submit", note: submissionNote });
      setSubmissionNote("");
      setNotice(`Sampling data submitted for review. Next: ${employeeName(samplingApprover)} reviews it. Status: Awaiting data review.`);
      recordActivity(`Submitted sampling data for ${currentJob.id}`, currentJob.id);
    } catch (error) { setNotice((error as Error).message); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function saveSamplingDataDraft() {
    updateCurrentJob("Sampling Data", "Complete sample records", { "Sampling Data": "In Progress" }, undefined, { samples, events });
    setNotice("Sampling Data draft saved to local demo data");
  }

  function completeSamplingData() {
    const incomplete = samples.filter((sample) => !sample.dataComplete || standardDataSheetErrors(sample).length > 0);
    if (incomplete.length) {
      const nextErrors = { ...sampleDataErrors };
      incomplete.forEach((sample) => { nextErrors[sample.id] = standardDataSheetErrors(sample).length ? standardDataSheetErrors(sample) : [`Mark Sample ${sample.id} Complete after filling its standard data sheet.`]; });
      setSampleDataErrors(nextErrors);
      setExpanded(incomplete[0].id);
      setNotice("");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const now = new Date().toISOString();
    setSamplingDataCompletedAt(now);
    const draftSummary = report.summary || deterministicSummary();
    const nextReport = { ...report, approvedBy: "", approvalDate: "", approvedAt: undefined, summary: draftSummary, preparedBy: report.preparedBy || currentEmployee?.id || "", preparedDate: report.preparedDate || localDate(), reportStatus: "Draft" as const };
    setReport(nextReport);
    updateCurrentJob("Report Preview", "Review and generate sampling report", { "Sampling Data": "Completed", "Report Preview": "In Progress" }, `completed Sampling Data for ${jobId}`, { samples, events, report: nextReport, status: "Report Draft" });
    setNotice(`Sampling Data completed by ${currentEmployee?.name}`);
    setStage("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updatePreparationSample(id: string, field: keyof Sample, value: string) {
    const now = preparationStartedAt || new Date().toISOString();
    if (!preparationStartedAt) setPreparationStartedAt(now);
    const cylinder = field === "bottleSerial" ? bottleInventory.find((item) => item.serial === value) : undefined;
    const bottleDetails = cylinder ? { bottle: cylinder.type, bottleCapacity: cylinder.capacity } : field === "bottleSerial" && !value ? { bottle: "", bottleCapacity: "" }
      // Switching container type clears the other type's identifier so a stale serial or ID is never reported.
      : field === "containerType" ? (value === "Glass container" ? { bottle: "", bottleSerial: "", bottleCapacity: "" } : { containerId: "" }) : {};
    const nextSamples = samples.map((sample) => sample.id === id ? { ...sample, [field]: value, ...bottleDetails, dataComplete: false, dataCompletedBy: "", dataCompletedAt: "", preparedBy: currentEmployee?.id || sample.preparedBy, preparedAt: sample.preparedAt || now } : sample);
    const nextTasks = coordinationTasks.map((task) => ["bottle", "bottleSerial", "bottleCapacity", "containerType", "containerId"].includes(field) && task.label === "Assign the required cylinders" ? { ...task, completed: false, completedBy: undefined, completedAt: undefined } : task);
    setSamples(nextSamples);
    setCoordinationTasks(nextTasks);
    if (currentJob) updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, undefined, { samples: nextSamples, coordinationTasks: nextTasks });
    setPreparationError([]);
  }

  function updateGeneralSampler(field: "sampler" | "samplerSerial" | "calibrationStatus" | "pressureTestStatus" | "equipmentCondition", value: string) {
    const now = preparationStartedAt || new Date().toISOString();
    if (!preparationStartedAt) setPreparationStartedAt(now);
    setSamples((current) => current.map((sample) => ({ ...sample, [field]: value, preparedBy: sample.preparedBy || currentEmployee?.id || "", preparedAt: sample.preparedAt || now })));
    setPreparationError([]);
  }

  function coordinationErrors() {
    const errors: string[] = [];
    if (samplingIsRequired(samplingType) && coordinationDetails.toolsRequired === "Required" && coordinationDetails.toolsAvailability !== "Available") errors.push("Required tools must be available before continuing.");
    const incomplete = coordinationTasks.filter((item) => !item.completed);
    if (incomplete.length) errors.push(`Complete all pre-job coordination tasks (${incomplete.length} remaining).`);
    if (isMpsrLabTransfer(samplingType)) {
      if (!coordinationDetails.sampleOwner.trim()) errors.push("Sample Owner is required for MPSR transfer.");
      if (!coordinationDetails.requiredItems.trim()) errors.push("Required Transfer Items must be recorded.");
    } else if (samplingType === "Wellhead Sampling" || samplingType === "Separator Sampling") {
      if (!coordinationDetails.samplingPointType.trim()) errors.push("Sampling Point Type is required.");
      if (!coordinationDetails.samplingPointSize.trim()) errors.push("Sampling Point Size is required.");
      if (!coordinationDetails.requiredSampleKit.trim()) errors.push("Required Sample Kit must be recorded.");
      if (!samples.length || samples.some((sample) => !containerComplete(sample))) errors.push("Complete each receiving bottle type and serial number, or glass container ID.");
      if (coordinationDetails.toolsRequired === "To Be Confirmed") errors.push("Confirm whether tools are required.");
      if (coordinationDetails.toolsRequired === "Required" && coordinationDetails.toolsAvailability === "To Be Confirmed") errors.push("Confirm tools availability.");
      if (samplingType === "Separator Sampling" && !job.samplingPoint.trim()) errors.push("Separator Sampling Point is required.");
    } else if (samplingType && samplingType !== "Other") {
      if (!coordinationDetails.requiredSampleKit.trim()) errors.push("Required Sample Kit must be recorded.");
      if (!samples.length || samples.some((sample) => !containerComplete(sample))) errors.push("Complete each receiving bottle type and serial number, or glass container ID.");
      if (coordinationDetails.toolsRequired === "To Be Confirmed") errors.push("Confirm whether tools are required.");
    }
    return errors;
  }

  function updateCoordinationDetail(field: keyof CoordinationDetails, value: string) {
    const now = new Date();
    const timestamp = now.toISOString();
    const nextDetails: CoordinationDetails = { ...coordinationDetails, [field]: value };
    let nextTasks = coordinationTasks;
    let nextEvents = events;

    if (field === "toolsRequired") {
      const confirmed = value !== "To Be Confirmed";
      nextDetails.toolsConfirmedBy = confirmed ? currentEmployee?.id : undefined;
      nextDetails.toolsConfirmedAt = confirmed ? timestamp : undefined;
      if (value === "Not Required") nextDetails.toolsAvailability = "Not Applicable";
      if (value === "Required" && nextDetails.toolsAvailability === "Not Applicable") nextDetails.toolsAvailability = "To Be Confirmed";

      nextTasks = coordinationTasks.map((task) => task.label === "Confirm whether tools are required" ? {
        ...task,
        completed: confirmed,
        completedBy: confirmed ? currentEmployee?.id : undefined,
        completedAt: confirmed ? timestamp : undefined,
      } : task);
      setCoordinationTasks(nextTasks);

      if (confirmed && currentEmployee) {
        const date = localDate(now);
        const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        nextEvents = [...events, { date, time, description: `Tools requirement confirmed: ${value}`, createdBy: currentEmployee.id, createdAt: timestamp }].sort((left, right) => `${left.date || ""}T${left.time}`.localeCompare(`${right.date || ""}T${right.time}`));
        setEvents(nextEvents);
      }
    }

    const invalidatedLabel = field === "requiredSampleKit" ? "Assign the required sample kit" : field === "samplingPointType" || field === "samplingPointSize" ? "sampling point" : "";
    nextTasks = nextTasks.map((task) => {
      if (task.label === "Confirm tools availability" && (field === "toolsRequired" || field === "toolsAvailability")) {
        const complete = nextDetails.toolsRequired === "Not Required" || (nextDetails.toolsRequired === "Required" && nextDetails.toolsAvailability === "Available");
        return { ...task, completed: complete, completedBy: complete ? currentEmployee?.id : undefined, completedAt: complete ? timestamp : undefined };
      }
      if (invalidatedLabel && task.label.includes(invalidatedLabel) && (field !== "samplingPointType" && field !== "samplingPointSize" || task.label.includes(field === "samplingPointType" ? "type" : "size"))) return { ...task, completed: false, completedBy: undefined, completedAt: undefined };
      return task;
    });
    setCoordinationTasks(nextTasks);
    setCoordinationDetails(nextDetails);
    setPreparationError([]);
    if (currentJob) updateCurrentJob("Sampling Preparation", "Complete pre-job coordination", { "Sampling Preparation": "In Progress" }, field === "toolsRequired" && value !== "To Be Confirmed" ? `confirmed tools requirement as ${value}` : undefined, { coordinationTasks: nextTasks, coordinationDetails: nextDetails, events: nextEvents });
  }

  function toggleCoordinationTask(taskId: string, completed: boolean) {
    if (!currentEmployee) return;
    const target = coordinationTasks.find((task) => task.id === taskId);
    if (completed && target) {
      let error = "";
      if (target.label === "Assign the required sample kit" && !coordinationDetails.requiredSampleKit.trim()) error = "Enter the sample kit details before confirming Ready.";
      if (target.label === "Assign the required cylinders" && (!samples.length || samples.some((sample) => !containerComplete(sample)))) error = "Enter the bottle type and serial number, or the glass container ID, for every sample before confirming Ready.";
      if (target.label.includes("sampling point") && target.label.includes("type") && !coordinationDetails.samplingPointType.trim()) error = "Enter the sampling point type.";
      if (target.label.includes("sampling point") && target.label.includes("size") && !coordinationDetails.samplingPointSize.trim()) error = "Enter the sampling point size.";
      if (target.label === "Confirm separator sampling point" && !job.samplingPoint.trim()) error = "Enter the separator sampling point.";
      if (error) { setPreparationError([error]); return; }
    }
    const now = new Date();
    const timestamp = now.toISOString();
    const nextTasks = coordinationTasks.map((item) => item.id === taskId ? { ...item, completed, completedBy: completed ? currentEmployee.id : undefined, completedAt: completed ? timestamp : undefined } : item);
    setCoordinationTasks(nextTasks);
    setPreparationError([]);
    if (!currentJob) return;
    const task = nextTasks.find((item) => item.id === taskId);
    let nextEvents = events;
    if (completed && task) {
      const date = localDate(now);
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      nextEvents = [...events, { date, time, description: `Pre-job checklist completed: ${task.label}`, createdBy: currentEmployee.id, createdAt: timestamp }].sort((left, right) => `${left.date || ""}T${left.time}`.localeCompare(`${right.date || ""}T${right.time}`));
      setEvents(nextEvents);
    }
    updateCurrentJob("Sampling Preparation", "Complete pre-job coordination", { "Sampling Preparation": "In Progress" }, completed && task ? `completed pre-job task: ${task.label}` : undefined, { coordinationTasks: nextTasks, coordinationDetails, events: nextEvents });
  }

  function selectSamplingType(type: SamplingSource) {
    setSamplingType(type);
    setCoordinationTasks((current) => createCoordinationTasks(type, current));
    setCoordinationDetails((current) => ({ ...current, sampleOwner: isMpsrLabTransfer(type) ? current.sampleOwner : "" }));
    setPreparationError([]);
    if (stage !== "job" && currentJob) updateCurrentJob("Sampling Preparation", "Complete source preparation", { "Sampling Preparation": "In Progress" }, undefined, { samplingSource: type });
    setSamplingRequired(samplingIsRequired(type));
    if (!requiresEquipmentPreparation(type)) {
      setSamples((current) => samplingIsRequired(type) && current.length ? current : samplingIsRequired(type) ? emptySamples().slice(0, 1).map((sample) => ({ ...sample, sampler: "", fieldData: { ...sample.fieldData, sampleNature: type === "Wellhead Sampling" ? "WHS" : type === "Separator Sampling" ? "SEP" : type === "Station Sampling" ? "STN" : "" } })) : []);
      setExpanded("1.01");
      return;
    }
    const now = preparationStartedAt || new Date().toISOString();
    if (!preparationStartedAt) setPreparationStartedAt(now);
    setSamples((current) => {
      const planned = current.length ? current : isSpmcFieldSampling(type) ? emptySamples().slice(0, 1) : emptySamples();
      const sharedSerial = planned[0]?.samplerSerial || "";
      return planned.map((sample) => ({ ...sample, sampler: isSpmcFieldSampling(type) ? "SPMC" : sample.sampler, samplerSerial: isSpmcFieldSampling(type) ? sharedSerial : sample.samplerSerial, fieldData: { ...sample.fieldData, sampleNature: isSpmcFieldSampling(type) ? "SPMC" : sample.fieldData.sampleNature }, preparedBy: sample.preparedBy || currentEmployee?.id || "", preparedAt: sample.preparedAt || now }));
    });
    setExpanded((current) => current || "1.01");
  }

  function addExtraSample() {
    if (samples.length >= 20) return;
    const now = new Date().toISOString();
    const id = `1.${String(samples.length + 1).padStart(2, "0")}`;
    const shared = samples[0];
    const extra = { ...emptySamples()[0], id,
      sampler: isSpmcFieldSampling(samplingType) ? "SPMC" : isCasedHoleSampling(samplingType) ? "SPS" : "",
      samplerSerial: isSpmcFieldSampling(samplingType) ? shared?.samplerSerial || "" : "",
      calibrationStatus: isSpmcFieldSampling(samplingType) ? shared?.calibrationStatus || "Not Checked" : "Not Checked",
      pressureTestStatus: isSpmcFieldSampling(samplingType) ? shared?.pressureTestStatus || "Not Checked" : "Not Checked",
      equipmentCondition: isSpmcFieldSampling(samplingType) ? shared?.equipmentCondition || "Not Checked" : "Not Checked",
      fieldData: { ...defaultFieldData(), sampleNature: shared?.fieldData.sampleNature || "" },
      preparedBy: currentEmployee?.id || "", preparedAt: now };
    const nextSamples = [...samples, extra];
    setSamples(nextSamples);
    setExpanded(id);
    const nextTasks = coordinationTasks.map((task) => task.label === "Assign the required cylinders" ? { ...task, completed: false, completedBy: undefined, completedAt: undefined } : task);
    setCoordinationTasks(nextTasks);
    if (currentJob) updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, `Added extra sample ${id}`, { samples: nextSamples, coordinationTasks: nextTasks });
    setNotice(`Extra sample ${id} added. Original requested quantity remains ${job.requestedSampleCount}.`);
  }

  function savePreparationDraft() {
    updateCurrentJob("Sampling Preparation", "Complete pre-job coordination and preparation", { "Sampling Preparation": "In Progress" }, undefined, { coordinationTasks, coordinationDetails });
    setNotice("Sampling Preparation draft saved to local demo data");
  }

  function completePreparation() {
    const errors: string[] = coordinationErrors();
    if (!requiresEquipmentPreparation(samplingType)) errors.push("Select an equipment-preparation sampling type to complete this workflow.");
    if (!job.well.trim()) errors.push("Well is required for field sampling.");
    if (isCasedHoleSampling(samplingType) && samples.length < 3 && !preparationNotes.trim() && !job.sampleCountNotes.trim()) errors.push("Cased Hole sampling defaults to at least 3 samples. Add Preparation Notes to document an explicit lower sample count.");
    if (isSpmcFieldSampling(samplingType) && samples.some((sample) => sample.sampler !== "SPMC")) errors.push("Open Hole SPMC field sampling must use the SPMC sampler type.");
    const incompleteSamples = samples.filter((sample) => !sample.sampler || !sample.samplerSerial.trim() || !containerComplete(sample));
    if (incompleteSamples.length) errors.push(`Complete required sampler and bottle details for ${incompleteSamples.map((sample) => `Sample ${sample.id}`).join(", ")}.`);
    if (errors.length) {
      setPreparationError(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const now = new Date().toISOString();
    setPreparationCompletedAt(now);
    const preparedSamples = samples.map((sample) => ({ ...sample, preparedBy: sample.preparedBy || currentEmployee?.id || "", preparedAt: sample.preparedAt || preparationStartedAt || now }));
    setSamples(preparedSamples);
    updateCurrentJob("Sampling Data", isCasedHoleSampling(samplingType) ? "Enter bottomhole sample data" : "Enter SPMC sample data", { "Sampling Preparation": "Completed", "Sampling Data": "In Progress" }, `completed Sampling Preparation for ${jobId}`, { samples: preparedSamples });
    setNotice(`Sampling Preparation completed by ${currentEmployee?.name}`);
    setStage("bottomhole");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completeSourcePreparation() {
    const errors: string[] = coordinationErrors();
    if (!samplingType) errors.push("Select a Sampling Source / Method.");
    if ((isCasedHoleSampling(samplingType) || samplingType === "Wellhead Sampling") && !job.well.trim()) errors.push("Well is required for this sampling source.");
    if (samplingType === "Separator Sampling" && !job.separatorId.trim()) errors.push("Separator Name / ID is required for Separator Sampling.");
    if (errors.length) {
      setPreparationError(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const now = new Date().toISOString();
    setPreparationCompletedAt(now);
    updateCurrentJob("Sampling Data", `Enter ${samplingType} data`, { "Sampling Preparation": "Completed", "Sampling Data": "In Progress" }, `completed Sampling Preparation for ${jobId}`, { samples });
    setNotice(`Sampling Preparation completed by ${currentEmployee?.name}`);
    setStage("bottomhole");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Problems that block sending (or saving a sent job). Drafts are saved without these checks. */
  function jobSendErrors(sending: boolean): string[] {
    const errors: string[] = [];
    if(!selectedClient?.active&&!currentJob)errors.push('Select an active client.');
    if (!job.fieldArea.trim()) errors.push("Field is required.");
    const namedWells = job.wells.map((well) => well.trim()).filter(Boolean);
    if (job.wellMode === "single" && namedWells.length !== 1) errors.push("Enter the well name.");
    if (job.wellMode === "multiple" && (namedWells.length < 2 || namedWells.length !== job.wells.length)) errors.push("Enter at least two well names and complete every well field.");
    if (!job.description.trim()) errors.push("Enter the job / request description.");
    if (!samplingType) errors.push("Sampling Type is required.");
    if (samplingType && !isMpsrLabTransfer(samplingType) && samplingType !== "Other") {
      if (!job.clientFocalPoint.trim()) errors.push("Enter the Client Focal Point.");
      if (!job.clientFocalPointContact.trim()) errors.push("Enter the Focal Point Contact Number.");
    }
    if (samplingType === "Other" && !job.otherSamplingType.trim()) errors.push("Specify the other sampling type.");
    const requestedCount = Number(job.requestedSampleCount);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 20) errors.push("Enter a whole sample count from 1 to 20.");
    if (isCasedHoleSampling(samplingType) && requestedCount < 3 && !job.sampleCountNotes.trim()) errors.push("Add a note explaining the request for fewer than 3 cased-hole samples.");
    // Jobs sent before instructions existed stay editable without them.
    if (sending && !job.samplingInstructions.trim()) errors.push("Write the sampling instructions for the sampling team.");
    if (!job.assignedEngineerId) errors.push("Assign the accountable sampling employee.");
    for (const id of [job.assignedEngineerId, ...job.samplingTeamIds].filter(Boolean)) {
      const person = demoEmployees.find(e => e.id === id);
      if (!person?.active) errors.push(`${person?.name || id} is not an active employee.`);
      else if (!allowed(authorization, id, 'sampling')) errors.push(`${person.name} needs sampling permission before assignment.`);
    }
    if (!demoEmployees.some(e => e.id === job.assignedDriverId && e.active)) errors.push('Assign an active driver.');
    return errors;
  }

  function saveDraft() {
    if (!currentEmployee || !hasPermission("createJob")) { setNotice("You are not authorized to create jobs."); return; }
    if (currentJob && !isDraft(currentJob)) return;
    if (!currentJob && !selectedClient?.active) { setJobErrors(["Select an active client before saving a draft; it forms part of the job ID."]); return; }
    setJobErrors([]); setDispatchReview(false);
    const reservedId = currentJob?.id || generatedJobId;
    try {
      updateCurrentJob("Job Setup", "Complete the draft and send it to Sampling", {}, `${currentJob ? "Saved" : "Created"} draft ${reservedId}`, { ...(currentJob ? {} : { id: reservedId, jobNumber: reservedId, globalSequence: nextSequence }), status: "Draft" });
    } catch (error) { setJobErrors([(error as Error).message]); return; }
    if (!currentJob) { window.localStorage.setItem(globalCounterStorageKey, String(nextSequence)); setGlobalCounter(nextSequence); setCreatedJobId(reservedId); }
    setNotice(`Draft ${reservedId} saved on this device. It has not been sent to Sampling.`);
  }

  function submitJob(event: React.FormEvent) {
    event.preventDefault();
    const sending = !currentJob || isDraft(currentJob);
    if(sending ? !hasPermission("createJob") : !hasPermission("jobDetails") || !coordinator(currentEmployee?.id)){setNotice("You are not authorized to save this job.");return;}
    const errors = jobSendErrors(sending);
    if (errors.length) {
      setJobErrors(errors); setDispatchReview(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setJobErrors([]);
    if(sending&&!dispatchReview){setDispatchReview(true);return;}
    if (!sending && currentJob) {
      updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, `Updated job details for ${currentJob.id}`);
      setWorkflowJobId(currentJob.id);
      setWorkspaceView("workflow");
      return;
    }
    const reservedJobId = currentJob?.id || generatedJobId;
    const reservedSequence = currentJob?.globalSequence || nextSequence;
    const requestedCount = Number(job.requestedSampleCount);
    const requiresSampling = samplingIsRequired(samplingType);
    const sampleNature = isCasedHoleSampling(samplingType) ? "BHS" : isSpmcFieldSampling(samplingType) ? "SPMC" : isMpsrLabTransfer(samplingType) ? "MPSR" : samplingType === "Wellhead Sampling" ? "WHS" : samplingType === "Separator Sampling" ? "SEP" : samplingType === "Station Sampling" ? "STN" : "";
    const plannedSamples = Array.from({ length: requestedCount }, (_, index) => ({
      ...(samples[index] || emptySamples()[0]), id: `1.${String(index + 1).padStart(2, "0")}`,
      sampler: isSpmcFieldSampling(samplingType) ? "SPMC" : isCasedHoleSampling(samplingType) ? "SPS" : "",
      fieldData: { ...(samples[index]?.fieldData || defaultFieldData()), sampleNature },
    }));
    const nextAction = requiresSampling ? "Complete sampling preparation" : "Complete pre-job coordination";
    try {
      updateCurrentJob("Sampling Preparation", nextAction, { "Job Setup": "Completed", "Sampling Preparation": "In Progress" }, `Sent job ${reservedJobId} to Sampling`, { id: reservedJobId, jobNumber: reservedJobId, globalSequence: reservedSequence, samplingRequired: requiresSampling, samplingSource: samplingType as SamplingSource, holeType: "", scopeOfWorkAttachment: scopeAttachment || undefined, samples: plannedSamples, coordinationTasks: createCoordinationTasks(samplingType, coordinationTasks), coordinationDetails, status: "Job Created" }, true);
    } catch (error) { setJobErrors([(error as Error).message]); setDispatchReview(false); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setSamplingRequired(requiresSampling);
    setSamples(plannedSamples);
    setExpanded("1.01");
    if (!currentJob) { window.localStorage.setItem(globalCounterStorageKey, String(reservedSequence)); setGlobalCounter(reservedSequence); }
    setDispatchReview(false);
    const team = [job.assignedEngineerId, ...job.samplingTeamIds.filter(id => id !== job.assignedEngineerId)];
    setNotice(`Job ${reservedJobId} sent to Sampling. Received by ${team.map((id, index) => employeeName(id) + (index === 0 ? " (accountable)" : "")).join(", ")}; driver ${employeeName(job.assignedDriverId)}. New stage: Sampling · Next action: ${nextAction}. No email was sent.`);
    // Leave the editor first so its URL sync cannot pull the view back to the sampling form.
    setCreatedJobId("");
    setWorkflowJobId(reservedJobId);
    location.assign('#workflow/' + encodeURIComponent(reservedJobId) + '/overview');
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addEvent() {
    if (!eventDraft.date || !eventDraft.time || !eventDraft.description.trim()) return;
    const now = new Date().toISOString();
    const nextEvents = [...events, { ...eventDraft, description: eventDraft.description.trim(), createdBy: currentEmployee?.id, createdAt: now }]
      .sort((left, right) => `${left.date || ""}T${left.time}`.localeCompare(`${right.date || ""}T${right.time}`));
    setEvents(nextEvents);
    if (currentJob) updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, "Created Sequence of Events entry", { events: nextEvents });
    else setNotice("Sequence of Events entry added. It will be saved when the job is created.");
    setEventDraft({ date: localDate(), time: "", description: "" });
  }

  function removeEvent(itemToRemove: SequenceEvent) {
    const nextEvents = events.filter((item) => item !== itemToRemove);
    setEvents(nextEvents);
    if (currentJob) updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, "Removed Sequence of Events entry", { events: nextEvents });
  }

  function reassignJob(employeeId: string) {
    if (!currentJob || !currentEmployee) return;
    const now = new Date().toISOString();
    setJob((current) => ({ ...current, assignedEngineerId: employeeId }));
    const next = jobs.map((item) => item.id !== currentJob.id ? item : { ...item, responsibleId: employeeId, assignedEngineerId: employeeId, lastUpdatedById: currentEmployee.id, lastUpdatedAt: now, stages: item.stages.map((workflow) => workflow.status === "In Progress" ? { ...workflow, assignedTo: employeeId, lastUpdatedBy: currentEmployee.id, lastUpdatedAt: now } : workflow) });
    persistJobs(next);
    recordActivity(`Reassigned responsibility to ${employeeName(employeeId)}`, currentJob.id, now);
  }

  /** Fills an empty browser with fictional DEMO jobs so visitors can explore the workflow. */
  async function loadDemoData() {
    if (jobs.length || window.localStorage.getItem(jobsStorageKey) && JSON.parse(window.localStorage.getItem(jobsStorageKey) || "[]").length) { setNotice("Demo data is only added to a browser with no saved jobs."); return; }
    setDemoLoading(true);
    try {
      const demoJobs = await buildDemoJobs((name, content) => storeWorkbook(new File([content], name, { type: name.endsWith(".pdf") ? "application/pdf" : "text/csv" })));
      if (!clients.some((item) => item.code === demoClient.code)) { const nextClients = [...clients, demoClient]; window.localStorage.setItem(clientStorageKey, JSON.stringify(nextClients)); setClients(nextClients); }
      persistJobs(demoJobs);
      const sequence = Math.max(globalCounter, ...demoJobs.map((item) => item.globalSequence));
      window.localStorage.setItem(globalCounterStorageKey, String(sequence)); setGlobalCounter(sequence);
      recordActivity("Loaded DEMO jobs", demoJobs[0].id);
      setNotice("Demo jobs loaded. All names and values are fictional. Use “Local demo profile” at the top to act as Salim, Ahmed, Wilfred or the field team.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Demo data could not be loaded."); }
    finally { setDemoLoading(false); }
  }

  function persistClients(next: Client[]) {
    if (!hasPermission("settings")) throw Error("You cannot manage clients.");
    window.localStorage.setItem(clientStorageKey, JSON.stringify(next));
    setClients(next);
  }

  function openAddClient() {
    if (!hasPermission("settings")) { setNotice("You cannot manage clients."); return; }
    setClientForm(emptyClientForm);
    setClientError("");
    setClientModal({ mode: "add" });
  }

  function openEditClient(item: Client) {
    setClientForm({ code: item.code, name: item.name, shortName: item.shortName, country: item.country, notes: item.notes, logo: item.logo });
    setClientError("");
    setClientModal({ mode: "edit", originalCode: item.code });
  }

  function saveClient(event: React.FormEvent) {
    event.preventDefault();
    if (!hasPermission("settings")) return setClientError("You cannot manage clients.");
    const code = clientForm.code.trim().toUpperCase();
    const name = clientForm.name.trim();
    const shortName = clientForm.shortName.trim();
    const originalCode = clientModal?.originalCode;
    if (originalCode && originalCode !== code) return setClientError("Existing client codes are permanent to preserve job references. Add a new client for a new code.");
    if (!name) return setClientError("Client Name is required.");
    if (!/^[A-Z0-9]$/.test(code)) return setClientError("Client Code must be one letter or number.");
    if (clients.some((item) => item.code === code && item.code !== originalCode)) return setClientError(`Client code ${code} is already being used.`);
    if (clients.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.code !== originalCode)) return setClientError("A client with this name already exists.");
    const saved: Client = { code, name, shortName: shortName || name, country: clientForm.country.trim() || "Oman", notes: clientForm.notes.trim(), logo: clientForm.logo, active: true };
    const next = clientModal?.mode === "edit" ? clients.map((item) => item.code === originalCode ? { ...saved, active: item.active } : item) : [...clients, saved];
    try { persistClients(next); } catch(e) { setClientError(e instanceof Error?e.message:"Could not save client."); return; }
    if (clientModal?.mode === "add" || client === originalCode) setClient(code);
    setClientModal(null);
    setNotice(clientModal?.mode === "edit" ? `${saved.shortName} updated in local demo data` : `${saved.shortName} added and selected`);
  }

  function toggleClientActive(item: Client) {
    if (!hasPermission("settings") || !window.confirm(`${item.active?"Deactivate":"Reactivate"} ${item.shortName}? Existing jobs and job numbers will be preserved.`)) return;
    const next = clients.map((current) => current.code === item.code ? { ...current, active: !current.active } : current);
    try { persistClients(next); } catch { setNotice("Could not save client status. Please retry."); return; }
    if (item.active && client === item.code) setClient(next.find((current) => current.active)?.code ?? "P");
  }

  function renderSequenceEventsPanel() {
    return <section className="panel sequence-events-panel persistent-events-panel">
      <div className="panel-heading premium-heading"><div><span className="eyebrow">SHARED JOB TIMELINE</span><h2>Sequence of Events</h2><p>Available throughout the workflow. Entries from every employee are stored in event date and time order.</p></div><span className="event-count">{events.length} EVENTS</span></div>
      <div className="events-table-wrap"><table className="events-table"><thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Entered By</th><th aria-label="Actions" /></tr></thead><tbody>{sortedEvents.length ? sortedEvents.map((item, index) => <tr key={item.createdAt || `${item.date}-${item.time}-${index}`}><td>{item.date || job.dateReceived}</td><td><strong>{item.time}</strong></td><td>{item.description}</td><td><strong>{employeeName(item.createdBy)}</strong><small>{formatDateTime(item.createdAt)}</small></td><td><button type="button" onClick={() => removeEvent(item)} aria-label="Remove event">×</button></td></tr>) : <tr className="events-empty-row"><td colSpan={5}>No events recorded yet. Add the first job event below.</td></tr>}</tbody></table></div>
      <div className="event-entry"><label><span>Event Date</span><input type="date" value={eventDraft.date} onChange={(event) => setEventDraft((current) => ({ ...current, date: event.target.value }))} /></label><label><span>Event Time</span><input type="time" value={eventDraft.time} onChange={(event) => setEventDraft((current) => ({ ...current, time: event.target.value }))} /></label><label><span>Event Description</span><input value={eventDraft.description} onChange={(event) => setEventDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Describe the job, field, transfer, or report event…" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEvent(); } }} /></label><button type="button" className="outline-button" onClick={addEvent}>+ Add Event</button></div>
    </section>;
  }

  // Guided sampling steps apply to jobs on the operations workflow with separate data review.
  const samplingFlow = !!currentJob?.operations && !isDraft(currentJob) && dataReviewRequired(currentJob) && stage !== "job" && stage !== "scope";
  const transferFlow = isMpsrLabTransfer(samplingType) || samplingType === "Other";
  const dataReview = currentJob ? latestData(currentJob) : undefined;
  const reviewPhase = !!dataReview && ["Submitted", "Approved"].includes(dataReview.status);
  const currentSamplingStatus = currentJob ? samplingStatus(currentJob, responsibilities) : undefined;
  const samplingStepIndex = stage === "type" ? 0 : stage === "bottomhole" ? 1 : reviewPhase || currentSamplingStatus?.key.startsWith("report") ? 3 : 2;
  const stageTitle = stage === "job" ? "Create a new laboratory job" : stage === "type" ? "Sampling preparation" : stage === "bottomhole" ? "Sampling data" : stage === "scope" ? "Final report" : "Report preview";
  const stageCopy = stage === "job" ? "Register the client, location, sampling scope, assignment and sampling instructions. Save a draft at any time; Send to Sampling when ready." : stage === "type" ? "Prepare equipment and verify field readiness for the sampling type selected at Job Setup." : stage === "bottomhole" ? "Capture the sample register and field event details for the prepared sample set." : stage === "scope" ? "The final Sampling and Analysis Report is ready to view or print." : "Review, approve, and generate the final Sampling and Analysis Report.";

  if (!authReady) return <div className="login-loading"><img src="/vaps-logo.png" alt="VAPS" /><span>Loading local workspace…</span></div>;

  if (!currentEmployee) return (
    <main className="login-page">
      <section className="login-visual" aria-label="VAPS PVT Lab & Sampling introduction">
        <div className="login-brand"><img src="/vaps-logo.png" alt="VAPS" /><span>INTERNAL OPERATIONS</span></div>
        <div className="login-visual-copy"><span className="eyebrow">PETROLEUM LABORATORY SERVICES</span><h1>Technical workflows.<br />Clear responsibility.</h1><p>A focused workspace for managing PVT laboratory jobs, sampling records, and operational accountability.</p></div>
        <div className="login-security"><span className="status-dot" /><div><strong>Local demo environment</strong><small>Prototype credentials and workflow data stay on this device.</small></div></div>
      </section>
      <section className="login-form-side">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-mobile-logo"><img src="/vaps-logo.png" alt="VAPS" /></div>
          <span className="eyebrow">EMPLOYEE ACCESS</span>
          <h2>VAPS PVT Lab & Sampling</h2>
          <p>Internal Laboratory Workflow Management</p>
          <div className="login-fields">
            <label><span>Employee ID</span><input autoComplete="username" value={loginForm.id} onChange={(event) => { setLoginForm((current) => ({ ...current, id: event.target.value.toUpperCase() })); setLoginError(""); }} placeholder="e.g. MA001" /></label>
            <label><span>Password</span><div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={loginForm.password} onChange={(event) => { setLoginForm((current) => ({ ...current, password: event.target.value })); setLoginError(""); }} placeholder="Enter password" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div></label>
          </div>
          {loginError && <div className="login-error" role="alert"><span>!</span>{loginError}</div>}
          <button className="login-submit" type="submit">Sign In <span>→</span></button>
          <small className="demo-hint">Demo access: {demoLogin.id} · Password {demoLogin.password}. After signing in, switch “Local demo profile” at the top to act as other team members.</small>
        </form>
      </section>
    </main>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src={company.logo} alt={company.displayName} />
          <small className="tool-title">PVT Lab <span>&amp; Sampling</span></small>
        </div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">WORKSPACE</p>{hasPermission("createJob") && <button type="button" className="nav-item" onClick={startNewJob}><Plus size={18} /> Create new job</button>}
          {navItems.map((item, index) => { const NavIcon = navIcons[index]; if (!canView(({ Dashboard: "dashboard", Jobs: "jobs", Sampling: "sampling", "PVT Lab": "pvt-lab", Inventory: "inventory", Settings: "settings" } as Record<string, string>)[item])) return null; return (
            <button key={item} className={(item === "Dashboard" && workspaceView === "dashboard") || (item === "Jobs" && (workspaceView === "jobs" || workspaceView === "workflow")) || (item === "New Job" && workspaceView === "new-job") || (item === "Sampling" && workspaceView === "sampling") || (item === "PVT Lab" && workspaceView === "pvt-lab")  || (item === "Settings" && workspaceView === "settings") || (item === "Inventory" && workspaceView === "inventory") ? "nav-item active" : "nav-item"} type="button" onClick={() => { if (item === "Dashboard") setWorkspaceView("dashboard"); if (item === "Jobs") setWorkspaceView("jobs"); if (item === "Sampling") setWorkspaceView("sampling"); if (item === "PVT Lab") { setLabJobId(""); setWorkspaceView("pvt-lab"); } if (item === "Settings") { setWorkspaceView("settings"); } if (item === "Inventory") { setWorkspaceView("inventory"); } if (item === "New Job") startNewJob(); }} aria-current={(item === "Dashboard" && workspaceView === "dashboard") || (item === "Jobs" && workspaceView === "jobs") || (item === "New Job" && workspaceView === "new-job") || (item === "Sampling" && workspaceView === "sampling") || (item === "PVT Lab" && workspaceView === "pvt-lab")  || (item === "Settings" && workspaceView === "settings") || (item === "Inventory" && workspaceView === "inventory") ? "page" : undefined}>
              <span className="nav-icon" aria-hidden="true"><NavIcon size={19} strokeWidth={1.8} /></span>{item}{item === "Sampling" && samplingUnseen > 0 && <span className="nav-badge" aria-label={`${samplingUnseen} new sampling updates`}>{samplingUnseen}</span>}{item === "PVT Lab" && labUnseen > 0 && <span className="nav-badge" aria-label={`${labUnseen} new laboratory updates`}>{labUnseen}</span>}
              {item === "Jobs" && <span className="nav-count">{jobs.length}</span>}
            </button>
          ); })}
        </nav>
        <div className="sidebar-card">
          <span className="status-dot" />
          <div><strong>Demo environment</strong><small>Data stays on this device</small></div>
        </div>
        <div className="user-area">
          {userMenuOpen && <div className="user-menu"><button type="button" onClick={() => { setWorkspaceView("profile"); setUserMenuOpen(false); }}>My Profile</button><button type="button" onClick={logout}>Logout</button></div>}
          <button className="user-card" type="button" onClick={() => setUserMenuOpen((current) => !current)} aria-expanded={userMenuOpen} aria-label={`Account menu for ${currentEmployee.name}`} title={`${currentEmployee.name} · ${directory.positions.find(p=>p.id===currentEmployee.positionId)?.name || currentEmployee.role}`}>
          <div className="avatar">{currentEmployee.initials}</div>
          <div><strong>{currentEmployee.name}</strong><small>{currentEmployee.role}</small></div>
          <span>⋮</span>
          </button>
        </div>
      </aside>

      <div className="trial-profile"><label>Local demo profile<select aria-label="Local demo profile" value={currentEmployee.id} onChange={e=>{if(window.confirmSettingsLeave&&!window.confirmSettingsLeave())return;const person=demoEmployees.find(p=>p.id===e.target.value&&p.active);if(person){setCurrentEmployee(person);sessionStorage.setItem(sessionStorageKey,person.id);setWorkspaceView('dashboard');}}}>{demoEmployees.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><span>Browser-local trial · not secure authentication</span></div><main className={workspaceView === "dashboard" ? "dashboard-main" : ""}>{workspaceView === "profile" && <TeamInbox jobs={hasPermission("jobDetails") ? jobs : []} actor={currentEmployee.id} onSwitch={id=>{const p=demoEmployees.find(e=>e.id===id && e.active);if(p){setCurrentEmployee(p);window.sessionStorage.setItem(sessionStorageKey,id);setWorkspaceView("dashboard");}}} onOpen={item=>{setWorkflowJobId(item.id);setWorkspaceView("workflow");}} onAction={(id,team,action)=>{try{if(!hasPermission("jobDetails") || !hasPermission(team === "analysis" ? "analysis" : team === "transport" ? "jobDetails" : "sampling")) throw Error("You do not have access to this handoff.");const fresh:JobRecord[]=JSON.parse(window.localStorage.getItem(jobsStorageKey)||"[]");const target=fresh.find(j=>j.id===id);if(!target)throw Error("Job no longer exists.");const now=new Date().toISOString();const updated=handoff(target,team,currentEmployee.id,action,now);persistJobs(fresh.map(j=>j.id===id?updated:j));recordActivity(team+": "+action,id,now);setNotice(action==="accept"?"Ownership accepted.":"Handoff completed; the next team can accept.");}catch(e){setNotice(e instanceof Error?e.message:"Could not update handoff.");}}} />}
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Open menu">☰</button>
          <div className="breadcrumb"><span>{workspaceView === "inventory" ? "Inventory" : workspaceView === "settings" ? "Settings" : workspaceView === "profile" ? "Employee" : "Workspace"}</span><b>/</b><strong>{workspaceView === "workflow" ? "Job workflow" : workspaceView === "inventory" ? "Bottle inventory" : workspaceView === "settings" ? ({company:"Company",clients:"Clients",employees:"Employees",authorization:"Authorization",departments:"Departments & Positions"}[settingsPage] || "Overview") : workspaceView === "profile" ? "My Profile" : workspaceView === "dashboard" ? "Dashboard" : workspaceView === "jobs" ? "Jobs" : workspaceView === "sampling" ? (samplingTab === "reports" ? "Sampling · Sampling Reports" : "Sampling") : workspaceView === "pvt-lab" ? "PVT Lab" : stage === "job" ? "New Job" : jobId}</strong></div>
          <div className="top-actions">
            <button className="settings-shortcut" type="button" onClick={() => { setWorkspaceView("settings"); }}><Settings size={18} aria-hidden="true" />Settings</button>
            {workspaceView === "dashboard" ? <span className="top-date">{dashboardDate}</span> : <span className="local-pill"><span className="status-dot" /> Local demo</span>}
            <button className="icon-button" type="button" aria-label="Notifications">◌<span className="notification-dot" /></button>
            <button className="top-avatar" type="button" onClick={() => setWorkspaceView("profile")} aria-label="Open my profile">{currentEmployee.initials}</button>
          </div>
        </header>

        <div className="page-wrap">
          {workspaceView !== "settings" && !!notice && <div className="notice" role="alert">{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice("")}>×</button></div>}
          {!canView(workspaceView) ? <section className="panel authorization-panel"><h1>Access restricted</h1><p>Ask Mohammed Al Awaisi to enable access in Settings → Authorization.</p><button className="primary-button" type="button" onClick={() => setWorkspaceView("dashboard")}>Back to dashboard</button></section> : workspaceView === "workflow" ? (workflowJob ? (!legacyView ? <OperationsWorkspace key={workflowJob.id+operationTab} job={workflowJob} actor={opsActor!} tab={operationTab} onNavigate={tab=>openOperation(workflowJob,tab)} onCommand={c=>runOperation(workflowJob.id,c)} onSampling={(target,sample)=>{resumeJob(workflowJob);setStage((target||samplingStageFor(workflowJob)) as Stage);if(sample)setExpanded(sample);}} onSetup={()=>{resumeJob(workflowJob);setStage('job');}} onLegacy={()=>setLegacyView(true)} /> : <JobWorkflow key={workflowJob.id} job={workflowJob} today={today} employeeName={employeeName} onBack={() => setWorkspaceView("jobs")} onOpenStage={(stageId) => stageId === "closed" ? resumeJob(workflowJob) : openStage(workflowJob, stageId)} />) : <section className="panel"><h1>Job not found</h1><button type="button" onClick={() => setWorkspaceView("jobs")}>Back to jobs</button></section>) : workspaceView === "dashboard" && !hasPermission("jobDetails") ? (<section className="panel authorization-panel"><h1>Welcome, {currentEmployee.name.split(" ")[0]}</h1><p>Choose an authorized workspace from the menu. Contact Mohammed Al Awaisi to request additional access.</p></section>) : workspaceView === "dashboard" ? (
            <>{jobs.length===0&&<section className="panel ops-panel demo-banner"><div><h2>Explore the workflow with demo jobs</h2><p>This browser has no jobs yet. Load four example jobs (sampling, report approval, laboratory work and a completed job) to see how work moves through the system. All names and values are fictional and marked DEMO; they are saved only in this browser.</p></div><button type="button" className="primary-button" disabled={demoLoading} onClick={() => void loadDemoData()}>{demoLoading ? "Loading…" : "Load demo data"}</button></section>}{hasPermission('createJob')&&<div className="ops-dashboard-actions"><button className="primary-button" onClick={startNewJob}>+ Create job</button></div>}<WeeklyWork jobs={hasPermission('jobDetails')?visibleJobs:[]} actor={{id:currentEmployee.id,employees:demoEmployees,policy:authorization,roles:responsibilities}} onOpen={openOperation}/>{currentEmployee.id==='MA001'&&<details className="panel ops-panel"><summary>Administrator · workflow clarification review</summary><ClarificationReview/></details>}<details className="company-summary"><summary>Company overview and activity</summary>
              <section className="cockpit-header">
                <div><h1>{timeGreeting}, {currentEmployee.name.split(" ")[0]}</h1><p>Here’s what needs your attention today.</p></div>
                <div className="cockpit-header-actions"><time>{dashboardShortDate}</time><button className="icon-button" type="button" aria-label="Notifications"><Bell size={18} strokeWidth={1.8} /><span className="notification-dot" /></button><button className="top-avatar" type="button" onClick={() => setWorkspaceView("profile")} aria-label="Open my profile">{currentEmployee.initials}</button></div>
              </section>

              <section className="operations-summary" aria-label="Operations summary">
                <button type="button" onClick={() => setDashboardFilter("all")}><span className="summary-icon active"><BriefcaseBusiness size={21} strokeWidth={1.8} /></span><div><small>Active Jobs</small><strong>{activeJobs.length}</strong><em>Currently open</em></div></button>
                <button type="button" onClick={() => setDashboardFilter("sampling")}><span className="summary-icon sampling"><FlaskConical size={21} strokeWidth={1.8} /></span><div><small>Sampling</small><strong>{samplingJobs.length}</strong><em>In field workflow</em></div></button>
                <button type="button" onClick={() => setDashboardFilter("reports")}><span className="summary-icon reports"><FileText size={21} strokeWidth={1.8} /></span><div><small>Sampling Reports Pending</small><strong>{pendingReports.length}</strong><em>Waiting for action</em></div></button>
                <button type="button" onClick={() => setDashboardFilter("due")}><span className="summary-icon attention"><TriangleAlert size={21} strokeWidth={1.8} /></span><div><small>Need Attention</small><strong>{attentionJobs.length}</strong><em>Review priority items</em></div></button>
              </section>

              <div className="cockpit-grid">
                <section className="cockpit-work" id="my-work">
                  <header><div><span className="eyebrow">Assigned work</span><h2>My Work</h2></div><button type="button" className="view-all-button" onClick={() => { setDashboardFilter("all"); setDashboardSearch(""); }}>View All Jobs →</button></header>
                <div className="cockpit-tools"><div className="cockpit-filters"><button className={dashboardFilter === "all" ? "active" : ""} type="button" onClick={() => setDashboardFilter("all")}>All My Work</button><button className={dashboardFilter === "sampling" ? "active" : ""} type="button" onClick={() => setDashboardFilter("sampling")}>Sampling</button><button className={dashboardFilter === "reports" ? "active" : ""} type="button" onClick={() => setDashboardFilter("reports")}>Sampling Reports</button><button className={dashboardFilter === "due" ? "active" : ""} type="button" onClick={() => setDashboardFilter("due")}>Due Soon</button></div><label className="cockpit-search"><Search size={16} strokeWidth={1.8} /><input value={dashboardSearch} onChange={(event) => setDashboardSearch(event.target.value)} placeholder="Search e.g. omp26001" aria-label="Search jobs by ID, client, field or well" /></label></div>
                  <div className="cockpit-job-list">{(hasPermission("jobDetails") ? filteredMyJobs : []).slice(0, 4).map((item) => <article className={expandedDashboardJob === item.id ? "cockpit-job expanded" : "cockpit-job"} key={item.id}>
                    <div className="cockpit-job-row">
                      <button type="button" className="cockpit-job-identity" onClick={() => setExpandedDashboardJob(expandedDashboardJob === item.id ? "" : item.id)} aria-expanded={expandedDashboardJob === item.id}><strong>{item.id}</strong><span><Building2 size={13} strokeWidth={1.8} />{item.clientName}<i>·</i><MapPin size={13} strokeWidth={1.8} />{locationSummary(item)}</span></button>
                      <div className="cockpit-job-work"><div className="cockpit-job-stage"><small>Current Stage</small><span className="stage-chip"><FlaskConical size={13} strokeWidth={1.9} />{prog(item).current?.label || "Closed"}</span></div><div className="cockpit-next"><small>Next Action</small><strong>{prog(item).current?.nextAction || "No action required"}</strong></div></div>
                      <div className="cockpit-job-outcome"><div className="cockpit-due"><small>Due</small><strong className={item.dueDate && item.dueDate < today ? "overdue" : ""}><CalendarDays size={14} strokeWidth={1.8} />{item.dueDate || "No due date"}</strong></div><div className="cockpit-progress" aria-label={`${progressFor(item)} percent complete`}><small>Progress</small><span><i style={{ width: `${progressFor(item)}%` }} /></span><strong>{progressFor(item)}%</strong></div><span className={`status-pill flow-${statusTone(item)}`}>{displayStatus(item)}</span>{isOverdue(item) && <span className="status-pill overdue">Overdue</span>}<button type="button" className="continue-button" onClick={() => openStage(item)}>Continue <ChevronRight size={15} strokeWidth={2} /></button></div>
                    </div>
                    {expandedDashboardJob === item.id && <div className="cockpit-job-details"><div><small>JOB OWNER</small><strong>{employeeName(item.ownerId)}</strong></div><div><small>ASSIGNED ENGINEER</small><strong>{employeeName(item.assignedEngineerId || item.responsibleId)}</strong></div><div><small>ASSIGNED DRIVER</small><strong>{employeeName(item.assignedDriverId)}</strong></div>{locationDetails(item).map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}<div><small>LAST UPDATED</small><strong>{formatDateTime(item.lastUpdatedAt)}</strong></div><div className="compact-stage-list">{prog(item).stages.map((workflow) => <span key={workflow.id} className={workflow.state === "done" ? "completed" : workflow.state === "active" ? "in-progress" : "not-started"}><i>{workflow.state === "done" ? "✓" : "•"}</i>{workflow.label}{workflow.waiting ? ` · ${workflow.waiting}` : ""}</span>)}</div></div>}
                  </article>)}{filteredMyJobs.length === 0 && <div className="cockpit-empty"><span>✓</span><div>{jobs.length === 0 ? <><strong>No active jobs assigned to you.</strong><p>Your assigned jobs will appear here.</p></> : <><strong>No matching active jobs</strong><p>Try another filter or search term.</p></>}</div></div>}</div>
                  {filteredMyJobs.length > 4 && <button type="button" className="load-more-work" onClick={() => { setDashboardFilter("all"); setDashboardSearch(""); }}>View {filteredMyJobs.length - 4} more jobs →</button>}
                </section>

                <aside className="priority-panel"><header><div><span className="eyebrow amber">Priority queue</span><h2>Needs Attention</h2><p>{attentionJobs.length} items require action</p></div><span>{attentionJobs.length}</span></header><div className="priority-list">{attentionJobs.slice(0, 3).map((item) => { const overdue = Boolean(item.dueDate && item.dueDate < today); const review = item.currentStage === "Report Preview"; const description = overdue ? "Job is overdue" : review ? "Report awaiting review" : item.nextAction.toLowerCase().includes("sample") ? "Missing sample information" : "Due soon"; const badge = overdue ? "Overdue" : review ? "Review" : item.nextAction.toLowerCase().includes("sample") ? "Missing Data" : "Due Soon"; return <button type="button" key={item.id} className={overdue ? "critical" : review ? "review" : "warning"} onClick={() => { setDashboardSearch(item.id); setDashboardFilter("all"); }}><i /><div><strong>{item.id}</strong><span>{description}</span><small>{item.dueDate ? `Due ${item.dueDate}` : "No due date"}</small></div><em>{badge}</em><ChevronRight size={16} strokeWidth={2} /></button>; })}{attentionJobs.length === 0 && <div className="priority-empty"><span>✓</span><strong>Nothing requires your attention.</strong></div>}</div>{attentionJobs.length > 0 && <footer><button type="button" onClick={() => { setDashboardFilter("due"); setDashboardSearch(""); document.getElementById("my-work")?.scrollIntoView({ behavior: "smooth" }); }}>View all items <ChevronRight size={14} strokeWidth={2} /></button></footer>}</aside>
              </div>

              <section className="compact-pipeline"><header><div><span className="eyebrow">Live pipeline</span><h2>Workload by Stage</h2></div><span className="closed-metric">{overviewStages.find((item) => item.name === "Closed")?.count || 0} Closed</span></header><div>{overviewStages.filter((item) => item.name !== "Closed").map((item, index, visibleStages) => { const StageIcon = item.name === "Job Setup" ? ClipboardList : item.name === "Sampling" ? FlaskConical : item.name === "Scope of Work" ? ListChecks : item.name === "Laboratory Analysis" ? Gauge : item.name === "Reporting" ? FileText : ShieldCheck; return <article className={item.name === "Sampling" && item.count > 0 ? "active" : ""} key={item.name}><button type="button" onClick={() => setDashboardFilter(item.name === "Sampling" ? "sampling" : item.name === "Reporting" ? "reports" : "all")}><StageIcon size={15} strokeWidth={1.8} /><span>{item.name === "Job Setup" ? "Job Setup" : item.name === "Scope of Work" ? "Scope" : item.name === "Laboratory Analysis" ? "Analysis" : item.name}</span><strong>{item.count}</strong></button>{index < visibleStages.length - 1 && <i><ChevronRight size={13} strokeWidth={1.7} /></i>}</article>; })}</div></section>
              {activities[0] ? <button type="button" className="latest-activity" onClick={() => setActivityExpanded(true)}><ActivityIcon size={18} strokeWidth={1.8} /><small>Latest Activity</small><strong>{employeeName(activities[0].employeeId)} {activities[0].action.toLowerCase()}</strong><em>for {activities[0].jobId} · {formatDateTime(activities[0].timestamp)}</em><b>View Activity <ChevronRight size={14} strokeWidth={2} /></b></button> : <div className="latest-activity latest-activity-empty"><ActivityIcon size={18} strokeWidth={1.8} /><small>Latest Activity</small><strong>No activity yet.</strong></div>}

              {activityExpanded && <div className="activity-drawer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setActivityExpanded(false); }} role="presentation"><aside className="activity-drawer" aria-label="Activity history"><header><div><span className="eyebrow">TEAM UPDATES</span><h2>Activity</h2></div><button type="button" onClick={() => setActivityExpanded(false)} aria-label="Close activity drawer">×</button></header><div>{activities.slice(0, 12).map((item) => <article key={item.id}><span className="activity-avatar">{demoEmployees.find((employee) => employee.id === item.employeeId)?.initials}</span><div><strong>{employeeName(item.employeeId)}</strong><p>{item.action}</p><small>{item.jobId} · {formatDateTime(item.timestamp)}</small></div></article>)}</div></aside></div>}
            </details></>
          ) : workspaceView === "jobs" ? (
            <>
              <section className="page-intro operations-page-intro"><div><span className="eyebrow">JOBS · MASTER REGISTER</span><h1>Jobs</h1><p>Every job, where it stands, and who acts next.</p></div>{hasPermission("createJob") && <button type="button" className="primary-button create-job-button" onClick={startNewJob}><Plus size={16} /> Create Job</button>}</section>
              <section className="operations-page-metrics"><article><span><Bell size={18} /></span><div><small>NEEDS MY ACTION</small><strong>{registerCounts.mine}</strong><em>Waiting for you</em></div></article><article><span><Gauge size={18} /></span><div><small>ACTIVE</small><strong>{registerCounts.active}</strong><em>Sent and in progress</em></div></article><article><span><ShieldCheck size={18} /></span><div><small>COMPLETED</small><strong>{registerCounts.completed}</strong><em>Workflow finished</em></div></article><article><span><TriangleAlert size={18} /></span><div><small>OVERDUE</small><strong>{overdueTasks.filter((item) => !isDraft(item)).length}</strong><em>Past due date</em></div></article></section>
              <section className="panel operations-register jobs-register"><div className="panel-heading premium-heading"><div><span className="eyebrow">JOB CONTROL</span><h2>Job register</h2><p>Search, filter, and open a job or its next action.</p></div><span className="event-count">{filteredJobsRegister.length} SHOWN</span></div>
                <div className="jobs-register-tools"><div className="cockpit-filters" role="group" aria-label="Job filters">{([["mine", "Needs my action"], ["active", "Active"], ...(hasPermission("createJob") || registerCounts.drafts ? [["drafts", "Drafts"]] : []), ["completed", "Completed"], ["all", "All jobs"]] as [typeof jobsRegisterFilter, string][]).map(([id, label]) => <button key={id} className={jobsRegisterFilter === id ? "active" : ""} aria-pressed={jobsRegisterFilter === id} type="button" onClick={() => setJobsRegisterFilter(id)}>{label} <span className="filter-count">{registerCounts[id]}</span></button>)}</div><label className="register-stage-filter"><span>STAGE</span><select value={jobsRegisterStage} onChange={(event) => setJobsRegisterStage(event.target.value)} aria-label="Filter by current stage"><option value="">All stages</option>{registerStages.map((label) => <option key={label}>{label}</option>)}</select></label><label className="cockpit-search jobs-id-search"><Search size={16} /><span>SEARCH</span><input value={jobsRegisterSearch} onChange={(event) => setJobsRegisterSearch(event.target.value)} placeholder="Job ID, client, field, well or person" aria-label="Search by Job ID or job details" /></label></div>
                <div className="operations-table-wrap"><table className="operations-table jobs-register-table"><thead><tr><th>Job ID</th><th>Client · Field / Well</th><th>Current stage</th><th>Next action by</th><th>Status · Due</th><th aria-label="Action" /></tr></thead><tbody>{filteredJobsRegister.map((item) => { const actions = actionsFor(item); const draft = isDraft(item); const next = actions[0]; const actionLabel = draft ? (hasPermission("createJob") ? "Continue draft" : "View draft") : next ? ({ overview: "Send to Sampling", sampling: "Open sampling", "sampling-report": "Sampling report", handover: "Record handover", scope: "Release lab scope", laboratory: "Plan lab work", reporting: "Final report" } as Record<string, string>)[next.id] || "Open job" : "Open job"; return <tr key={item.id} className={actions.length ? "needs-action" : undefined}><td><button type="button" className="table-job-link" onClick={() => setSelectedJobDetailsId(item.id)}>{item.id}</button><small>Created {reportDate(item.createdAt)}</small></td><td><strong>{item.clientName}</strong><small>{[item.fieldArea, item.wellMode === "multiple" ? (item.wells || []).filter(Boolean).join(", ") : item.well].filter(Boolean).join(" · ") || "Location not recorded"}</small></td><td><span className="stage-chip">{registerStage(item)}</span><small>{draft ? "Not sent to Sampling" : next ? next.next : prog(item).current?.nextAction || "No action required"}</small></td><td><strong>{draft ? employeeName(item.createdById) : stageOwner(item)}</strong>{actions.length > 0 && <small className="your-action">Your action</small>}</td><td>{draft ? <span className="status-pill flow-pending">Draft</span> : <span className={`status-pill flow-${statusTone(item)}`}>{displayStatus(item)}</span>}{isOverdue(item) && !draft && <span className="status-pill overdue">Overdue</span>}<small className={isOverdue(item) && !draft ? "overdue-text" : ""}>Due {item.dueDate ? reportDate(item.dueDate) : "not set"}</small></td><td><button type="button" className={actions.length || (draft && hasPermission("createJob")) ? "primary-button register-action" : "continue-button"} onClick={() => draft ? (hasPermission("createJob") ? resumeJob(item) : openOperation(item)) : openOperation(item, next ? next.id : "overview")}>{actionLabel} <ChevronRight size={14} /></button></td></tr>; })}{filteredJobsRegister.length === 0 && <tr className="operations-empty-row"><td colSpan={6}><BriefcaseBusiness size={22} /><strong>{visibleJobs.length ? "No jobs match this view." : "No jobs yet."}</strong><span>{visibleJobs.length ? "Try another filter, stage or search." : hasPermission("createJob") ? "Choose Create Job to register the first job." : "Jobs assigned to you will appear here."}</span></td></tr>}</tbody></table></div>
              </section>
              {selectedJobDetails && <div className="job-details-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSelectedJobDetailsId(""); }} role="presentation"><aside className="job-details-drawer" aria-label={`Job details for ${selectedJobDetails.id}`}>
                <header><div><span className="eyebrow">COMPLETE JOB RECORD</span><h2>{selectedJobDetails.id}</h2><p>{selectedJobDetails.clientName} · {prog(selectedJobDetails).current?.label || "Closed"}</p></div><button type="button" onClick={() => setSelectedJobDetailsId("")} aria-label="Close job details">×</button></header>
                <div className="job-details-scroll"><button type="button" className="primary-button" onClick={() => { setWorkflowJobId(selectedJobDetails.id); setSelectedJobDetailsId(""); setWorkspaceView("workflow"); }}>View job workflow</button>
                  <section className="job-details-section"><h3>Sampling scope &amp; instructions</h3><p><strong>Samples requested:</strong> {selectedJobDetails.requestedSampleCount || "Not recorded"}</p><p className="instructions-text"><strong>Sampling instructions:</strong> {selectedJobDetails.samplingInstructions || "Not recorded"}</p>{(selectedJobDetails.requiredTests || []).length > 0 && <p><strong>Initial laboratory request (reference only):</strong> {(selectedJobDetails.requiredTests || []).map((test) => test === "Other" ? selectedJobDetails.otherTests : test).join(" · ")}</p>}{selectedJobDetails.sampleCountNotes && <p>{selectedJobDetails.sampleCountNotes}</p>}</section>
                  <section className="job-details-status"><div><small>STATUS</small><span className={`status-pill flow-${statusTone(selectedJobDetails)}`}>{displayStatus(selectedJobDetails)}</span>{isOverdue(selectedJobDetails) && <span className="status-pill overdue">Overdue</span>}</div><div><small>PROGRESS</small><strong>{progressFor(selectedJobDetails)}%</strong><span className="job-details-progress"><i style={{ width: `${progressFor(selectedJobDetails)}%` }} /></span></div><div><small>NEXT ACTION</small><strong>{prog(selectedJobDetails).current?.nextAction || "No action required"}</strong></div></section>
                  <section className="job-details-section"><h3>Job Information</h3><div className="job-details-grid"><div><small>CLIENT</small><strong>{selectedJobDetails.clientName}</strong></div><div><small>COUNTRY</small><strong>{jobCountries.find((country) => country.code === (selectedJobDetails.countryCode || selectedJobDetails.id.split("-")[0]))?.name || selectedJobDetails.countryCode || "Not specified"}</strong></div><div><small>DATE RECEIVED</small><strong>{reportDate(selectedJobDetails.dateReceived)}</strong></div><div><small>FIELD</small><strong>{selectedJobDetails.fieldArea || "Not specified"}</strong></div><div><small>WELL</small><strong>{selectedJobDetails.wellMode === "multiple" ? (selectedJobDetails.wells || []).filter(Boolean).join(", ") || "Not specified" : selectedJobDetails.well || "Not specified"}</strong></div><div><small>INSTALLATION / RIG</small><strong>{selectedJobDetails.rigInstallation || "Not specified"}</strong></div><div><small>DUE DATE</small><strong>{reportDate(selectedJobDetails.dueDate)}</strong></div><div><small>CLIENT FOCAL POINT</small><strong>{selectedJobDetails.clientFocalPoint || "Not specified"}</strong></div><div><small>FOCAL POINT CONTACT</small><strong>{selectedJobDetails.clientFocalPointContact || "Not specified"}</strong></div><div><small>FOCAL POINT EMAIL</small><strong>{selectedJobDetails.clientFocalPointEmail || selectedJobDetails.clientReference || "Not specified"}</strong></div></div><div className="job-details-description"><small>JOB / REQUEST DESCRIPTION</small><p>{selectedJobDetails.description || "Not specified"}</p></div></section>
                  <section className="job-details-section"><h3>Responsibility &amp; Tracking</h3><div className="job-details-grid"><div><small>JOB RESPONSIBLE PERSON</small><strong>{employeeName(selectedJobDetails.jobResponsibleId || selectedJobDetails.responsibleId)}</strong></div><div><small>JOB OWNER</small><strong>{employeeName(selectedJobDetails.ownerId)}</strong></div><div><small>ASSIGNED ENGINEER</small><strong>{employeeName(selectedJobDetails.assignedEngineerId || selectedJobDetails.responsibleId)}</strong></div><div><small>ASSIGNED DRIVER</small><strong>{employeeName(selectedJobDetails.assignedDriverId)}</strong></div><div><small>CREATED BY</small><strong>{employeeName(selectedJobDetails.createdById)}</strong></div><div><small>CREATED</small><strong>{formatDateTime(selectedJobDetails.createdAt)}</strong></div><div><small>LAST UPDATED BY</small><strong>{employeeName(selectedJobDetails.lastUpdatedById)}</strong></div><div><small>LAST UPDATED</small><strong>{formatDateTime(selectedJobDetails.lastUpdatedAt)}</strong></div></div></section>
                  <section className="job-details-section"><h3>Sampling &amp; Report</h3><div className="job-details-grid"><div><small>SAMPLING TYPE</small><strong>{selectedJobDetails.samplingSource === "Other" && selectedJobDetails.otherSamplingType ? `Other — ${selectedJobDetails.otherSamplingType}` : selectedJobDetails.samplingSource || "Not selected"}</strong></div><div><small>FIELD SAMPLING</small><strong>{selectedJobDetails.samplingRequired === undefined ? "Not decided" : selectedJobDetails.samplingRequired ? "Required" : "Not required"}</strong></div><div><small>SAMPLE RECORDS</small><strong>{selectedJobDetails.samples?.length || 0}</strong></div><div><small>DATA SHEETS COMPLETE</small><strong>{selectedJobDetails.samples?.filter((sample) => sample.dataComplete).length || 0} / {selectedJobDetails.samples?.length || 0}</strong></div><div><small>REPORT STATUS</small><strong>{selectedJobDetails.report?.reportStatus || "Not started"}</strong></div><div><small>SEQUENCE EVENTS</small><strong>{selectedJobDetails.events?.length || 0}</strong></div>{selectedJobDetails.report && <><div><small>REPORT PREPARED BY</small><strong>{employeeName(selectedJobDetails.report.preparedBy)}</strong></div><div><small>REPORT APPROVER</small><strong>{employeeName(selectedJobDetails.report.approvedBy)}</strong></div><div><small>APPROVAL DATE</small><strong>{reportDate(selectedJobDetails.report.approvalDate)}</strong></div></>}</div>
                    {(selectedJobDetails.samples?.length || 0) > 0 && <div className="job-details-table"><table><thead><tr><th>Sample</th><th>Sampler</th><th>Bottle / Container</th><th>Data Sheet</th></tr></thead><tbody>{selectedJobDetails.samples?.map((sample) => <tr key={sample.id}><td><strong>{sample.id}</strong></td><td>{sample.sampler || "Not specified"}{sample.samplerSerial ? ` · ${sample.samplerSerial}` : ""}</td><td>{containerLabel(sample, "Not specified")}</td><td><span className={`data-sheet-pill ${sample.dataComplete ? "complete" : "not-started"}`}>{sample.dataComplete ? "Complete" : "Not complete"}</span></td></tr>)}</tbody></table></div>}
                  </section>
                  <section className="job-details-section"><h3>Pre-job Coordination</h3><div className="job-details-grid"><div><small>CHECKLIST PROGRESS</small><strong>{selectedJobDetails.coordinationTasks?.filter((task) => task.completed).length || 0} / {selectedJobDetails.coordinationTasks?.length || 0}</strong></div><div><small>TOOLS REQUIREMENT</small><strong>{selectedJobDetails.coordinationDetails?.toolsRequired || "Not Confirmed"}</strong></div><div><small>TOOLS AVAILABILITY</small><strong>{selectedJobDetails.coordinationDetails?.toolsAvailability || "Not Confirmed"}</strong></div><div><small>TOOLS CONFIRMED BY</small><strong>{selectedJobDetails.coordinationDetails?.toolsConfirmedBy ? employeeName(selectedJobDetails.coordinationDetails.toolsConfirmedBy) : "Not Confirmed"}</strong></div><div><small>CONFIRMATION DATE</small><strong>{selectedJobDetails.coordinationDetails?.toolsConfirmedAt ? formatDateTime(selectedJobDetails.coordinationDetails.toolsConfirmedAt) : "Not Confirmed"}</strong></div></div>{selectedJobDetails.coordinationTasks?.length ? <div className="job-details-workflow coordination-drawer-list">{selectedJobDetails.coordinationTasks.map((task) => <article key={task.id}><span className={task.completed ? "completed" : "not-started"}>{task.completed ? "✓" : "•"}</span><div><strong>{task.label}</strong><small>{task.completed ? `Completed by ${employeeName(task.completedBy)}` : "Pending sampling team action"}</small></div><div><em>{task.completed ? "Completed" : "Pending"}</em><small>{task.completed ? formatDateTime(task.completedAt) : "Not completed"}</small></div></article>)}</div> : <p className="job-details-empty">No pre-job checklist is recorded for this job.</p>}</section>
                  <section className="job-details-section"><h3>Sequence of Events</h3>{selectedJobDetails.events?.length ? <div className="job-details-events">{[...selectedJobDetails.events].sort((a, b) => `${b.date || ""}T${b.time || ""}`.localeCompare(`${a.date || ""}T${a.time || ""}`)).map((item, index) => <article key={item.createdAt || `${item.date}-${item.time}-${index}`}><time>{reportDate(item.date)} · {item.time || "No time"}</time><strong>{item.description}</strong><small>{employeeName(item.createdBy)}</small></article>)}</div> : <p className="job-details-empty">No sequence-of-events entries recorded yet.</p>}</section>
                  <section className="job-details-section"><h3>Sampling Workflow Stages</h3><div className="job-details-workflow">{selectedJobDetails.stages.map((workflow) => <article key={workflow.name}><span className={workflow.status.toLowerCase().replace(" ", "-")}>{workflow.status === "Completed" ? "✓" : workflow.status === "Skipped" ? "—" : "•"}</span><div><strong>{workflow.name}</strong><small>Assigned to {employeeName(workflow.assignedTo)}</small></div><div><em>{workflow.status}</em><small>{workflow.completed ? `Completed ${formatDateTime(workflow.completed)}` : workflow.started ? `Started ${formatDateTime(workflow.started)}` : "Not started"}</small></div></article>)}</div></section>
                </div>
                <footer><button type="button" className="outline-button" onClick={() => setSelectedJobDetailsId("")}>Close</button><button type="button" className="primary-button" onClick={() => { setSelectedJobDetailsId(""); openStage(selectedJobDetails); }}>Continue Workflow <ChevronRight size={15} /></button></footer>
              </aside></div>}
            </>
          ) : workspaceView === "sampling" ? (
            <>
              <section className="page-intro operations-page-intro"><div><span className="eyebrow">SAMPLING · OPERATIONS CONTROL</span><h1>Sampling</h1><p>Sampling activities and their sampling reports, kept on the same job record from preparation to approval.</p></div></section>
              <div className="sampling-tabs" role="tablist" aria-label="Sampling sections"><button type="button" role="tab" aria-selected={samplingTab === "jobs"} className={samplingTab === "jobs" ? "active" : ""} onClick={() => setSamplingTab("jobs")}><FlaskConical size={16} aria-hidden="true" />My sampling work<span>{mySamplingWork.length}</span></button><button type="button" role="tab" aria-selected={samplingTab === "reports"} className={samplingTab === "reports" ? "active" : ""} onClick={() => setSamplingTab("reports")}><FileText size={16} aria-hidden="true" />Sampling Reports<span>{reportsWorkspaceJobs.length}</span></button></div>
              {samplingTab === "jobs" ? <>
              {(() => {
                const row = (item: JobRecord, mine: boolean) => { const status = samplingStatus(item, responsibilities); const team = samplingTeam(item); const unseen = mine ? unseenEvents(item) : []; const sent = item.operations?.dispatchedAt; return <tr key={item.id} className={mine && status.owner === currentEmployee.id ? "needs-action" : undefined}><td><button type="button" className="table-job-link" onClick={() => openSamplingTask(item)}>{item.id}</button><small>{item.clientName}</small>{unseen.some((key) => key.startsWith("assign:")) && <span className="status-pill new-pill">New assignment</span>}{unseen.some((key) => key.startsWith("return:")) && <span className="status-pill returned-pill">Returned</span>}{unseen.some((key) => key.startsWith("review:") || key.startsWith("report:")) && <span className="status-pill new-pill">New for review</span>}</td><td><strong>{item.fieldArea || "Field not recorded"}</strong><small>{item.wellMode === "multiple" ? (item.wells || []).filter(Boolean).join(", ") : item.well || "Well not recorded"}</small></td><td><strong>{item.samplingSource === "Other" && item.otherSamplingType ? `Other — ${item.otherSamplingType}` : item.samplingSource}</strong></td><td><strong>{employeeName(team[0])}</strong><small>{team.length > 1 ? "Supporting: " + team.slice(1).map(employeeName).join(", ") : "No supporting employees"}</small></td><td><small>Sent {sent ? reportDate(sent) : "not recorded"}</small><small className={isOverdue(item) ? "overdue-text" : ""}>Due {item.dueDate ? reportDate(item.dueDate) : "not set"}</small></td><td><span className={`status-pill ${status.key === "returned" ? "returned-pill" : status.key === "report-approved" ? "flow-closed" : "flow-active"}`}>{status.label}</span><small>Next: {status.next}{status.owner ? ` · ${employeeName(status.owner)}` : ""}</small></td><td><button type="button" className={mine && (status.owner === currentEmployee.id || (status.team && team.includes(currentEmployee.id))) ? "primary-button register-action" : "continue-button"} onClick={() => openSamplingTask(item)}>{samplingActionLabel(item)} <ChevronRight size={14} /></button></td></tr>; };
                const head = <thead><tr><th>Job</th><th>Field / Well</th><th>Sampling type</th><th>Assigned</th><th>Dates</th><th>Status · next action</th><th aria-label="Action" /></tr></thead>;
                return <>
                  <section className="panel operations-register sampling-queue"><div className="panel-heading premium-heading"><div><span className="eyebrow">MY ASSIGNED WORK</span><h2>My sampling work</h2><p>Jobs assigned to you, and sampling reviews waiting for you. Open a job to see its instructions and next step.</p></div><span className="event-count">{mySamplingWork.length} JOBS</span></div>
                    <div className="operations-table-wrap"><table className="operations-table sampling-queue-table">{head}<tbody>{mySamplingWork.map((item) => row(item, true))}{mySamplingWork.length === 0 && <tr className="operations-empty-row"><td colSpan={7}><FlaskConical size={22} /><strong>No sampling work assigned to you.</strong><span>Jobs sent to you appear here with their instructions.</span></td></tr>}</tbody></table></div>
                  </section>
                  {(hasPermission("createJob") || hasPermission("sampling")) && <details className="panel operations-register team-overview" open={mySamplingWork.length === 0}><summary><span className="eyebrow">TEAM OVERVIEW</span><strong>All sampling jobs ({samplingOverview.length})</strong><small>Read-only overview for authorized users. Drafts are not shown.</small></summary>
                    <div className="operations-table-wrap"><table className="operations-table sampling-queue-table">{head}<tbody>{samplingOverview.map((item) => row(item, false))}{samplingOverview.length === 0 && <tr className="operations-empty-row"><td colSpan={7}><strong>No sampling jobs yet.</strong><span>{hasPermission("createJob") ? "Jobs appear here after you send them to Sampling." : "Jobs sent to Sampling will appear here."}</span></td></tr>}</tbody></table></div>
                  </details>}
                </>;
              })()}
              </> : <>

              <section className="panel operations-register"><div className="panel-heading premium-heading"><div><span className="eyebrow">REPORT REGISTER</span><h2>Sampling reports</h2><p>Drafts, checking, approval and approved sampling reports stay linked to their job. Each stays linked to its job and sample records — click a job ID to see its full workflow.</p></div><span className="event-count">{reportsWorkspaceJobs.length} REPORTS</span></div>
                <div className="operations-table-wrap"><table className="operations-table reports-register-table"><thead><tr><th>Report / Job</th><th>Client</th><th>Field / Well</th><th>Prepared By</th><th>Prepared Date</th><th>Approval Status</th><th>Last Updated</th><th /></tr></thead><tbody>{reportsWorkspaceJobs.map((item) => { const modernReport=latest(item.operations?.samplingReports||[]); const reportStatus = modernReport?.status || item.report?.reportStatus || "Draft"; return <tr key={item.id}><td><button type="button" className="table-job-link" onClick={() => { setWorkflowJobId(item.id); setWorkspaceView("workflow"); }}>{item.id}</button><small>Sampling report · {item.samples?.filter((sample) => sample.dataComplete).length || 0}/{item.samples?.length || 0} sample sheets</small></td><td><strong>{item.clientName}</strong></td><td><strong>{item.fieldArea || "Not specified"}</strong><small>{item.well || "Well not specified"}</small></td><td><strong>{employeeName(modernReport?.preparedBy||item.report?.preparedBy)}</strong></td><td><span>{modernReport?.preparedAt ? reportDate(modernReport.preparedAt) : item.report?.preparedDate ? reportDate(item.report.preparedDate) : "Not recorded"}</span></td><td><span className={`report-status-pill ${reportStatus.toLowerCase().replaceAll(" ", "-")}`}>{reportStatus}</span></td><td><span>{formatDateTime(item.lastUpdatedAt)}</span></td><td><button type="button" className="continue-button" onClick={() => { if(item.operations){openOperation(item,"sampling-report");return;} resumeJob(item); setStage(reportStatus === "Completed" ? "scope" : "report"); }}>Open Report <ChevronRight size={14} /></button></td></tr>; })}{reportsWorkspaceJobs.length === 0 && <tr className="operations-empty-row"><td colSpan={8}><FileText size={22} /><strong>No reports available yet.</strong><span>Drafts, checking, approval and approved sampling reports stay linked to their job.</span></td></tr>}</tbody></table></div>
              </section>
              </>}
            </>
) : workspaceView === "pvt-lab" ? (
            <><LabWorkspace jobs={visibleJobs.filter((item) => !isDraft(item))} actor={opsActor!} unseen={unseenLab} onOpen={(item) => { markSeen(labEvents(item)); openOperation(item.job, "laboratory?activity=" + encodeURIComponent(item.a.id)); }} /><WeeklyWork jobs={visibleJobs} actor={{id:currentEmployee.id,employees:demoEmployees,policy:authorization,roles:responsibilities}} onOpen={openOperation} teamView={currentEmployee.id==='MA001'||(['scopeSelector','pvtSupervisor','pvtTeamLead','chemicalTeamLead'] as const).some(key=>roleHolder(responsibilities,key,demoEmployees)===currentEmployee.id)}/><details className="panel ops-panel"><summary>Historical PVT plans and progress</summary><Clarification id="legacy"/><PvtLab key={labJobId || "lab-list"} initialJobId={labJobId} jobs={jobs.filter(item => !isDraft(item))} today={today} employeeName={employeeName} team={labTeam}
              canPlan={canPlanLab} lockReason={labLockReason}
              onOpenJob={(item) => { setWorkflowJobId(item.id); setWorkspaceView("workflow"); }} onEditScope={(item) => { resumeJob(item); setStage("job"); }}
              onSavePlan={(id, plan) => {
                const target = jobs.find((item) => item.id === id);
                if (!target) return;
                if(Object.entries(plan.assignees).some(([key,id])=>id && id!==target.labPlan?.assignees[key] && !demoEmployees.some(e=>e.id===id&&e.active))) {setNotice("Choose active employees for new lab assignments.");return;}
                if (!canPlanLab(target)) { setNotice("Only the PVT lab team or a job coordinator can plan lab work."); return; }
                const now = new Date().toISOString();
                const labPlan: LabPlan = { ...plan, savedBy: currentEmployee.id, savedAt: now };
                persistJobs(jobs.map((item) => item.id === id ? { ...item, labPlan, lastUpdatedById: currentEmployee.id, lastUpdatedAt: now } : item));
                const items = planKeys({ ...target, labPlan });
                recordActivity(`PVT Lab plan ${target.labPlan ? "updated" : "saved"}: ${items.filter((key) => key.startsWith("validation:")).length} validation steps, ${items.filter((key) => !key.startsWith("validation:")).length} tests`, id, now);
              }}
              onUpdateTest={(id, key, progress) => {
                const target = jobs.find((item) => item.id === id);
                const labItem = target && labItems(target).find((item) => item.key === key);
                if (!target || !labItem) return;
                const blocked = labLockReason(target, labItem);
                if (blocked) { setNotice(blocked); return; }
                const now = new Date().toISOString();
                const updated = { ...progress, updatedBy: currentEmployee.id, updatedAt: now };
                persistJobs(jobs.map((item) => {
                  if (item.id !== id) return item;
                  const next: JobRecord = { ...item, labTests: { ...item.labTests, [key]: updated }, lastUpdatedById: currentEmployee.id, lastUpdatedAt: now };
                  // Close the job only when the sampling report is approved and every assigned lab item is complete.
                  if (item.status === "Sampling Completed" && item.report?.reportStatus === "Completed" && labComplete(next)) next.status = "Completed";
                  if (item.status === "Completed" && !labComplete(next)) next.status = "Sampling Completed";
                  return next;
                }));
                recordActivity(`PVT Lab: ${itemLabel(target, key)} — ${progress.status}`, id, now);
              }} /></details></>
          ) : workspaceView === "profile" ? (
            <>
              <section className="page-intro profile-intro"><div><span className="eyebrow">EMPLOYEE · MY PROFILE</span><h1>My Profile</h1><p>Your demo employee identity, assigned workload, and recent workflow activity.</p></div></section>
              <section className="profile-hero panel"><div className="profile-avatar">{currentEmployee.initials}</div><div><h2>{currentEmployee.name}</h2><p>{currentEmployee.role}</p><span>{currentEmployee.id}</span></div><div className="profile-state"><span className="status-dot" /> Active employee</div></section>
              <section className="metric-grid profile-metrics"><article><span>ACTIVE JOBS</span><strong>{myActiveJobs.length}</strong><small>assigned to you</small></article><article><span>JOBS COMPLETED</span><strong>{myCompletedJobs.length}</strong><small>owned by you</small></article><article><span>CURRENT TASKS</span><strong>{myActiveJobs.length}</strong><small>open next actions</small></article><article><span>CURRENT STAGES</span><strong>{new Set(myActiveJobs.map((item) => item.currentStage)).size}</strong><small>distinct workflow stages</small></article></section>
              <div className="profile-grid">
                <section className="panel"><div className="panel-heading"><span className="section-number">01</span><div><h2>Current workflow stages</h2><p>Active stages currently assigned to you.</p></div></div><div className="profile-work-list">{myActiveJobs.map((item) => <article key={item.id}><div><strong>{item.id}</strong><span>{item.clientName} · {locationSummary(item)}</span></div><div><span className="stage-chip">{item.currentStage}</span><small>{item.nextAction}</small></div></article>)}</div></section>
                <section className="panel"><div className="panel-heading"><span className="section-number">02</span><div><h2>Activity history</h2><p>Your recent recorded actions.</p></div></div><div className="profile-history">{myActivities.slice(0, 8).map((item) => <article key={item.id}><span className="timeline-dot" /><div><strong>{item.action}</strong><p>{item.jobId}</p><small>{formatDateTime(item.timestamp)}</small></div></article>)}</div></section>
              </div>
            </>
          ) : workspaceView === "inventory" ? (
            <>
              <section className="page-intro inventory-intro"><div><span className="eyebrow">INVENTORY · BOTTLES</span><h1>Inventory</h1><p>Manage bottle types, serial numbers and capacities.</p></div></section>
              <BottleSettings inventory={bottleInventory} loadError={bottleLoadError} onAdd={(bottle) => {
                const invalid = validateBottle(bottle, bottleInventory);
                if (invalid || bottleLoadError) throw new Error(invalid || bottleLoadError);
                const next = [...customBottles, bottle];
                window.localStorage.setItem(bottleStorageKey, JSON.stringify(next));
                setCustomBottles(next);
              }} />
            </>
          ) : workspaceView === "settings" ? (
            <>
              <SettingsShell page={settingsPage} can={hasPermission}>
              {directoryError && <p role="alert">{directoryError}</p>}
              {notice && <p role="status">{notice}</p>}
              {settingsPage==='employees' && hasPermission('employees') && <EmployeeSettings directory={directory} onSave={saveDirectory} jobs={jobs} onReview={item=>{setWorkflowJobId(item.id);setWorkspaceView('workflow');}} />}
              {settingsPage==='departments' && hasPermission('employees') && <OptionSettings directory={directory} onSave={saveDirectory} />}
              {settingsPage==='company' && hasPermission('company') && <CompanySettings company={company} onSave={next=>{if(!hasPermission('company')) throw Error('You cannot manage company details.'); localStorage.setItem('vaps-company-v1',JSON.stringify(next));setCompany(next);}} />}
              {settingsPage === "authorization" && hasPermission("authorization") && <AuthorizationSettings key={JSON.stringify([authorization,responsibilities,testRouting,labTeams])} teams={labTeams} teamsError={labTeamsError} onSaveTeams={next => {
                if (!hasPermission("authorization") || labTeamsError) return false;
                try { const validated = readLabTeams(JSON.stringify(next), demoEmployees.map(person => person.id)); window.localStorage.setItem(labTeamsKey, JSON.stringify(validated)); setLabTeams(validated); recordActivity("Updated laboratory teams", "Settings"); setNotice("Laboratory teams saved."); return true; }
                catch { setNotice("Laboratory teams could not be saved. Please try again."); return false; }
              }} routing={testRouting} routingError={testRoutingError} onSaveRouting={next => {
                if (!hasPermission("authorization") || testRoutingError) return false;
                try { const validated = readTestRouting(JSON.stringify(next)); window.localStorage.setItem(testRoutingKey, JSON.stringify(validated)); setTestRouting(validated); recordActivity("Updated laboratory test routing", "Settings"); setNotice("Test routing saved."); return true; }
                catch { setNotice("Test routing could not be saved. Please try again."); return false; }
              }} policy={authorization} roles={responsibilities} rolesError={responsibilitiesError} employees={demoEmployees} departments={directory.departments} error={authorizationError} onSaveRoles={next => {
                if (!hasPermission("authorization")) return false;
                try { const validated = readResponsibilities(JSON.stringify(next)); window.localStorage.setItem(responsibilitiesKey, JSON.stringify(validated)); setResponsibilities(validated); setResponsibilitiesError(""); recordActivity("Updated responsibilities: " + (Object.keys(validated) as (keyof Responsibilities)[]).filter(key => validated[key] !== responsibilities[key]).map(key => responsibilityLabels[key] + " → " + (demoEmployees.find(e => e.id === validated[key])?.name || "Not assigned")).join("; "), "Settings"); setNotice("Responsibilities saved."); return true; }
                catch { setNotice("Responsibilities could not be saved. Please try again."); return false; }
              }} onSave={next => {
                if (!hasPermission("authorization")) return false;
                try { const validated = readAuthorization(JSON.stringify(next), demoEmployees.map(person => person.id)); window.localStorage.setItem(authorizationKey, JSON.stringify(validated)); setAuthorization(validated); setNotice("Authorization saved."); return true; }
                catch { setNotice("Authorization could not be saved. Please try again."); return false; }
              }} />}
              {settingsPage === "clients" && hasPermission("settings") && <section className="panel clients-settings-panel">
                <div className="panel-heading"><span className="section-number">01</span><div><h2>Client directory</h2><p>Inactive clients remain in history but cannot be selected for new jobs.</p></div><button type="button" className="primary-button settings-add-button" onClick={openAddClient}>+ Add Client</button></div>
                <p>Client codes are permanent identifiers used in job numbering. Editing client details never rewrites existing job numbers.</p><div className="settings-filters"><label>Search clients<input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Name or code" /></label><label>Status<select value={clientStatus} onChange={e=>setClientStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div><div className="client-table-wrap">
                  <table className="client-table">
                    <thead><tr><th>Code</th><th>Display Name</th><th>Client Name</th><th>Country</th><th>Status</th><th aria-label="Actions" /></tr></thead>
                    <tbody>{clients.filter(item=>[item.name,item.shortName,item.code].join(" ").toLowerCase().includes(clientSearch.toLowerCase()) && (clientStatus==="all" || item.active===(clientStatus==="active"))).map((item) => <tr key={item.code} className={!item.active ? "inactive-row" : ""}><td><span className="table-code">{item.code}</span></td><td><ClientLogo client={item} /><strong>{item.shortName}</strong></td><td>{item.name}</td><td>{item.country}</td><td><span className={item.active ? "status-pill active" : "status-pill inactive"}>{item.active ? "Active" : "Inactive"}</span></td><td><div className="row-actions"><button type="button" onClick={() => openEditClient(item)}>Edit</button><button type="button" className={item.active ? "deactivate" : "reactivate"} onClick={() => toggleClientActive(item)}>{item.active ? "Deactivate" : "Reactivate"}</button></div></td></tr>)}{!clients.some(item=>[item.name,item.shortName,item.code].join(' ').toLowerCase().includes(clientSearch.toLowerCase()) && (clientStatus==='all'||item.active===(clientStatus==='active')))&&<tr><td colSpan={6}>No clients match. Try another search or status filter.</td></tr>}</tbody>
                  </table>
                </div>
              </section>}
              </SettingsShell>
            </>
          ) : (
            <>
          <section className="page-intro">
            <div>
              <span className="eyebrow">PVT OPERATIONS · NEW JOB</span>
              <h1>{stageTitle}</h1>
              <p>{stageCopy}</p>
            </div>
            {stage !== "job" && <div className="job-badge"><small>JOB ID</small><strong>{jobId}</strong><span>{clientName}</span></div>}
          </section>

          {stage !== "job" && stage !== "type" && stage !== "bottomhole" && currentJob && <>
            <section className="responsibility-strip">
              <div><small>JOB OWNER</small><strong>{employeeName(currentJob.ownerId)}</strong><span>Created by {employeeName(currentJob.createdById)} · {formatDateTime(currentJob.createdAt)}</span></div>
              <label><small>CURRENT ASSIGNED ENGINEER</small><select disabled value={currentJob.assignedEngineerId || currentJob.responsibleId} onChange={(event) => reassignJob(event.target.value)}>{demoEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <div><small>CURRENT STAGE</small><strong>{currentJob.currentStage}</strong></div>
              <div><small>LAST UPDATED BY</small><strong>{employeeName(currentJob.lastUpdatedById)}</strong><span>{formatDateTime(currentJob.lastUpdatedAt)}</span></div>
            </section>
          </>}

          {stage === "type" && <section className="preparation-job-summary">
            <div><small>JOB ID</small><strong>{jobId}</strong></div>
            <div><small>CLIENT</small><strong>{clientName}</strong></div>
            {job.fieldArea && <div><small>FIELD / AREA</small><strong>{job.fieldArea}</strong></div>}
            <div><small>ASSIGNED ENGINEER</small><strong>{employeeName(currentJob?.assignedEngineerId || currentJob?.responsibleId || job.assignedEngineerId)}</strong></div>
            <div><small>ASSIGNED DRIVER</small><strong>{employeeName(currentJob?.assignedDriverId || job.assignedDriverId)}</strong></div>
            <div><small>CURRENT STAGE</small><strong>Sampling Preparation</strong></div>
            <div><small>STATUS</small><strong>In Progress</strong></div>
          </section>}

          {stage === "type" && <details className="job-context-details"><summary>More job context <span>⌄</span></summary><div><span><small>Created by</small><strong>{employeeName(currentJob?.createdById)}</strong></span><span><small>Last updated</small><strong>{formatDateTime(currentJob?.lastUpdatedAt)}</strong></span></div></details>}

          {stage === "bottomhole" && <>
            <section className="sampling-data-job-summary">
              <div><small>JOB ID</small><strong>{jobId}</strong></div>
              <div><small>CLIENT</small><strong>{clientName}</strong></div>
              {locationDetails(job, samplingType).map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
              <div><small>ASSIGNED ENGINEER</small><strong>{employeeName(currentJob?.assignedEngineerId || currentJob?.responsibleId || job.assignedEngineerId)}</strong></div>
              <div><small>ASSIGNED DRIVER</small><strong>{employeeName(currentJob?.assignedDriverId || job.assignedDriverId)}</strong></div>
              <div><small>SAMPLING SOURCE / METHOD</small><strong>{samplingTypeLabel}</strong></div>
              {requiresEquipmentPreparation(samplingType) && <div><small>SAMPLE COUNT</small><strong>{samples.length}</strong></div>}
              <div><small>CURRENT STAGE</small><strong>Sampling Data</strong></div>
            </section>
            <details className="job-context-details"><summary>More job context <span>⌄</span></summary><div><span><small>Preparation completed</small><strong>{formatDateTime(preparationCompletedAt)}</strong></span><span><small>Job owner</small><strong>{employeeName(currentJob?.ownerId)}</strong></span><span><small>Last updated</small><strong>{formatDateTime(currentJob?.lastUpdatedAt)}</strong></span></div></details>
          </>}

          {samplingFlow ? (() => {
            const prep = currentJob!.stages.find((item) => item.name === "Sampling Preparation")?.status;
            const done = samples.filter((sample) => sample.dataComplete).length;
            const steps = [
              { label: transferFlow ? "Transfer preparation" : "Preparation", stage: "type" as Stage, status: prep === "Completed" || prep === "Skipped" ? "Completed" : prep === "In Progress" ? "Saved · incomplete" : "Not started" },
              { label: transferFlow ? "Sample transfer data" : "Sample records & data", stage: "bottomhole" as Stage, status: samples.length && done === samples.length ? "Complete" : `${done} / ${samples.length} complete` },
              { label: "Review & submit", stage: "report" as Stage, status: dataReview?.status === "Returned" ? "Returned" : reviewPhase ? "Submitted" : "Not submitted" },
              { label: "Review status & report", stage: "report" as Stage, status: currentSamplingStatus!.label },
            ];
            return <ol className="stepper sampling-stepper" aria-label="Sampling steps">{steps.map((item, index) => <li key={item.label} className={index === samplingStepIndex ? "current" : index < samplingStepIndex ? "done" : ""}><button type="button" onClick={() => setStage(item.stage)} aria-current={index === samplingStepIndex ? "step" : undefined}><span>{index < samplingStepIndex ? "✓" : index + 1}</span><small>{item.label}</small><em>{item.status}</em></button></li>)}</ol>;
          })() : <ol className="stepper" aria-label="Workflow progress">
            {workflowStageNames.map((label, index) => {
              const stageIndex = stage === "job" ? 0 : stage === "type" ? 1 : stage === "bottomhole" ? 2 : stage === "report" ? 3 : 4;
              const done = index < stageIndex;
              const current = index === stageIndex;
              return <li key={label} className={current ? "current" : done ? "done" : ""}><span>{done ? "✓" : index + 1}</span><small>{label}</small></li>;
            })}
          </ol>}

          {samplingFlow && dataReview?.status === "Returned" && <section className="panel returned-box" role="status"><h2>Returned for correction</h2><p>{employeeName(dataReview.reviewedBy)} returned the sampling data on {formatDateTime(dataReview.reviewedAt)}.</p><p className="instructions-text">{dataReview.general}</p><ul>{dataReview.comments.map((comment, index) => <li key={index}><strong>{comment.label}</strong>: {comment.text} <button type="button" className="text-button" onClick={() => { const sample = comment.target.startsWith("sample:") ? comment.target.split(":")[1] : ""; setStage(comment.target === "preparation" || comment.target === "job" ? "type" : "bottomhole"); if (sample) setExpanded(sample); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Open section →</button></li>)}</ul>{currentEmployee.id === currentJob!.assignedEngineerId ? <button type="button" className="primary-button" onClick={() => setStage("report")}>Review &amp; resubmit</button> : <p>You can help correct the data. {employeeName(currentJob!.assignedEngineerId)} resubmits it.</p>}</section>}

          {samplingFlow && (stage === "type" || stage === "bottomhole") && <section className="panel step-guide"><div><span className="eyebrow">STEP {stage === "type" ? 1 : 2} OF 4</span><h2>{stage === "type" ? (transferFlow ? "Transfer preparation" : "Preparation") : (transferFlow ? "Sample transfer data" : "Sample records & sampling data")}</h2><p>{stage === "type" ? "Complete the coordination checklist and prepare the equipment and container for each sample. Glass containers need only their own ID." : "Fill the standard data sheet for every sample and mark each one complete. Use N/A only where a condition does not apply."}</p><p className="required-legend"><strong>Required:</strong> fields marked * · <strong>Optional:</strong> remarks and notes · Your entries are kept when you move between steps; use Save Draft to store them.</p></div><div className="step-guide-status"><small>STATUS</small><strong>{currentSamplingStatus!.label}</strong><span>Next: {currentSamplingStatus!.next}</span>{samplingDataLocked(currentJob!) ? <button type="button" className="outline-button" onClick={() => setStage("report")}>View submission</button> : stage === "type" ? <button type="button" className="outline-button" onClick={() => setStage("bottomhole")}>Continue to sample data →</button> : <button type="button" className="outline-button" onClick={() => setStage("report")}>Continue to review &amp; submit →</button>}</div></section>}


          {stage !== "job" && stage !== "type" && currentJob && <details className="workflow-details"><summary><span>Workflow responsibility</span><strong>{currentJob.currentStage} · {currentJob.stages.filter((item) => item.status === "Completed" || item.status === "Skipped").length} of {workflowStageNames.length} stages resolved</strong><i>⌄</i></summary><section className="stage-tracking" aria-label="Workflow responsibility">{currentJob.stages.map((item) => <article key={item.name} className={item.status.toLowerCase().replace(" ", "-")}><div><span>{item.status === "Completed" ? "✓" : item.status === "Skipped" ? "—" : "•"}</span><strong>{item.name}</strong></div><dl><div><dt>Assigned to</dt><dd>{employeeName(item.assignedTo)}</dd></div><div><dt>Status</dt><dd>{item.status}</dd></div><div><dt>Started</dt><dd>{formatDateTime(item.started)}</dd></div><div><dt>Completed</dt><dd>{formatDateTime(item.completed)}</dd></div><div><dt>Last updated by</dt><dd>{employeeName(item.lastUpdatedBy)}</dd></div></dl></article>)}</section></details>}

          {stage !== "job" && <section className="panel scope-plan-summary"><h2>Sampling scope</h2><p><strong>Sampling:</strong> {samplingTypeLabel || "Not selected"} · <strong>Samples requested:</strong> {job.requestedSampleCount || "Not specified"}</p>{job.sampleCountNotes && <p>{job.sampleCountNotes}</p>}</section>}
          {stage !== "job" && <section className="panel instructions-panel"><div className="panel-heading"><div><h2>Sampling instructions</h2><p>From {employeeName(currentJob?.createdById)} · Assigned: {[job.assignedEngineerId, ...job.samplingTeamIds.filter((id) => id !== job.assignedEngineerId)].filter(Boolean).map((id, index) => employeeName(id) + (index === 0 ? " (accountable)" : "")).join(", ") || "Not assigned"}</p></div></div><p className="instructions-text">{job.samplingInstructions || "No specific sampling instructions recorded for this job."}</p></section>}
          {stage !== "job" && currentJob && <div className="track-job-link"><button type="button" className="outline-button" onClick={() => { setWorkflowJobId(currentJob.id); setWorkspaceView("workflow"); }}>View job workflow & summary</button></div>}
          {stage !== "job" && <section className="panel"><div className="panel-heading"><div><h2>Client Focal Point</h2><p>Recorded at Job Setup · Reference for the sampling team</p></div></div><div className="job-details-grid"><div><small>NAME</small><strong>{job.clientFocalPoint || "Not specified"}</strong></div><div><small>CONTACT NUMBER</small><strong>{job.clientFocalPointContact || "Not specified"}</strong></div><div><small>EMAIL</small><strong>{job.clientFocalPointEmail || "Not specified"}</strong></div></div></section>}
          {stage === "job" && (() => {
            const editingDraft = !currentJob || isDraft(currentJob);
            const positionName = (e: Employee) => directory.positions.find((p) => p.id === e.positionId)?.name || e.role;
            const personLabel = (e: Employee) => `${e.name} — ${positionName(e)}`;
            const samplingCandidates = demoEmployees.filter((e) => e.active && allowed(authorization, e.id, "sampling"));
            const samplingDepartment = (e: Employee) => e.departmentId === "sampling" || e.role === "sampling";
            const driverCandidates = demoEmployees.filter((e) => e.active);
            const isDriver = (e: Employee) => e.departmentId === "transport" || e.role === "transport";
            const approver = roleHolder(responsibilities, "samplingApproval", demoEmployees);
            const team = [job.assignedEngineerId, ...job.samplingTeamIds.filter((id) => id !== job.assignedEngineerId)].filter(Boolean);
            const toggleMember = (id: string, on: boolean) => { setJob((current) => ({ ...current, samplingTeamIds: on ? [...current.samplingTeamIds.filter((x) => x !== id), id] : current.samplingTeamIds.filter((x) => x !== id) })); setDispatchReview(false); setJobErrors([]); };
            const memberBox = (e: Employee) => <label key={e.id} className="ops-check"><input type="checkbox" checked={job.samplingTeamIds.includes(e.id)} onChange={(event) => toggleMember(e.id, event.target.checked)} />{personLabel(e)}</label>;
            return <form onSubmit={submitJob} className="job-create-form">
              <section className="panel client-panel">
                <div className="panel-heading"><span className="section-number">01</span><div><h2>Client &amp; location</h2><p>Choose the client, their focal point, and where the sampling takes place.</p></div><span className="required-chip">CLIENT *</span></div>
                <div className="client-grid">
                  {activeClients.map((item) => <button type="button" key={item.code} disabled={!!currentJob} className={client === item.code ? "client-option selected" : "client-option"} aria-pressed={client === item.code} onClick={() => { setClient(item.code); if (!currentJob) setCreatedJobId(""); }}><ClientLogo client={item} /><strong>{item.shortName}</strong><small>{item.name !== item.shortName ? item.name : item.country}</small><span className="client-code">Code {item.code}</span><i aria-hidden="true">✓</i></button>)}
                  {!currentJob && <button type="button" className="client-option add-client-card" onClick={openAddClient}><span>+</span><strong>Add New Client</strong><small>Create a local client record</small></button>}
                </div>
                <div className="form-grid">
                  <label className="full-field"><span>Client Focal Point</span><input autoComplete="section-client name" value={job.clientFocalPoint} onChange={(e) => updateJob("clientFocalPoint", e.target.value)} placeholder="e.g. Ahmed Al Harthy" /></label>
                  <label><span>Focal Point Contact Number</span><input type="tel" autoComplete="section-client tel" value={job.clientFocalPointContact} onChange={(e) => updateJob("clientFocalPointContact", e.target.value)} placeholder="e.g. +968 9XXX XXXX" /></label>
                  <label><span>Focal Point Email</span><input type="email" autoComplete="section-client email" value={job.clientFocalPointEmail} onChange={(e) => updateJob("clientFocalPointEmail", e.target.value)} placeholder="e.g. focal.point@client.com" /></label>
                  <label><span>Country *</span><select required disabled={!!currentJob} value={job.countryCode} onChange={(event) => { updateJob("countryCode", event.target.value); setCreatedJobId(""); }}>{jobCountries.map((country) => <option value={country.code} key={country.code}>{country.name} ({country.code})</option>)}</select></label>
                  <label><span>Field *</span><input required value={job.fieldArea} onChange={(e) => updateJob("fieldArea", e.target.value)} placeholder="e.g. Lekhwair" /></label>
                  <div className="well-selection-field full-field">
                    <span>Well *</span>
                    <div className="well-mode-toggle" role="group" aria-label="Choose single or multiple wells"><button type="button" className={job.wellMode === "single" ? "selected" : ""} onClick={() => selectWellMode("single")}>Single Well</button><button type="button" className={job.wellMode === "multiple" ? "selected" : ""} onClick={() => selectWellMode("multiple")}>Multiple Wells</button></div>
                    {job.wellMode === "single" ? <input required value={job.wells[0] || ""} onChange={(event) => updateWell(0, event.target.value)} placeholder="e.g. LKW-501" /> : <div className="multiple-well-list">{job.wells.map((well, index) => <div className="multiple-well-row" key={index}><span>{index + 1}</span><input required value={well} onChange={(event) => updateWell(index, event.target.value)} placeholder={`Well ${index + 1} name`} />{job.wells.length > 2 && <button type="button" onClick={() => removeWell(index)} aria-label={`Remove well ${index + 1}`}>Remove</button>}</div>)}<button type="button" className="add-well-button" onClick={addWell}>+ Add another well</button></div>}
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading"><span className="section-number">02</span><div><h2>Job ID &amp; dates</h2><p>The job ID follows the existing numbering rule (country · client code · year · global sequence) and is reserved when the job is first saved.</p></div></div>
                <div className="form-grid">
                  <div className="id-preview job-id-only"><div><small>JOB ID{currentJob ? "" : " · RESERVED ON FIRST SAVE"}</small><strong>{jobId}</strong></div></div>
                  <label><span>Job Date *</span><input required type="date" value={job.dateReceived} onChange={(e) => updateJob("dateReceived", e.target.value)} /></label>
                  <label><span>Due Date</span><input type="date" value={job.dueDate} onBlur={e=>{if(e.currentTarget.value!==job.dueDate)updateJob("dueDate",e.currentTarget.value);}} onChange={(e) => updateJob("dueDate", e.target.value)} /></label>
                </div>
              </section>

              <section className="panel job-sampling-panel">
                <div className="panel-heading"><span className="section-number">03</span><div><h2>Sampling type &amp; sampling scope</h2><p>What the sampling team must collect. Laboratory tests are selected per sample after the sampling report is approved.</p></div><span className="required-chip">REQUIRED</span></div>
                <div className="prep-type-grid compact-job-types">
                  {samplingSources.map((type) => <button key={type} type="button" disabled={!editingDraft} className={`prep-type-card functional ${samplingType === type ? "selected" : ""}`} onClick={() => selectSamplingType(type)}><div><strong>{type}</strong><small>{samplingType === type ? (samplingIsRequired(type) ? "SAMPLING REQUIRED" : "NO FIELD SAMPLING") : "SELECT TYPE"}</small></div><i>{samplingType === type ? "✓" : ""}</i></button>)}
                </div>
                {samplingType === "Other" && <label className="other-sampling-type-field"><span>Specify Other Type *</span><input value={job.otherSamplingType} onChange={(event) => updateJob("otherSamplingType", event.target.value)} placeholder="Enter the job or transfer type" /></label>}
                <div className="form-grid scope-plan-fields"><label><span>Number of Samples Required *</span><input type="number" min="1" max="20" step="1" required disabled={!editingDraft} value={job.requestedSampleCount} onChange={(event) => updateJob("requestedSampleCount", event.target.value)} /><small>Creates one record per sample (1.01, 1.02 …) when sent.</small></label><label className="full-field"><span>Sample Quantity Notes</span><input value={job.sampleCountNotes} onChange={(event) => updateJob("sampleCountNotes", event.target.value)} placeholder="Quantity requirements or reason for fewer than 3 cased-hole samples" /></label></div>
                <label className="scope-upload"><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(event) => attachScopeOfWork(event.target.files?.[0])} /><span>{scopeAttachment ? "Replace file" : "Attach client request / scope document (optional)"}</span><small>PDF, Word, Excel, or image · You can continue without a file.</small></label>
                {scopeAttachment && <div className="attachment-record"><div><strong>{scopeAttachment.name}</strong><small>{Math.max(1, Math.round(scopeAttachment.size / 1024))} KB · Stored in local demo data</small></div><a href={scopeAttachment.dataUrl} download={scopeAttachment.name}>Open / download</a><button type="button" onClick={() => setScopeAttachment(null)}>Remove</button></div>}
                {job.requiredTests.length > 0 && <div className="reference-note"><strong>Initial laboratory request (reference only)</strong><p>{job.requiredTests.map((test) => test === "Other" ? job.otherTests.trim() || "Other" : test).join(" · ")}</p><small>Recorded when the job was created. It is not the approved laboratory scope, which is released per sample after sampling approval.</small></div>}
              </section>

              <section className="panel ops-panel">
                <div className="panel-heading"><span className="section-number">04</span><div><h2>Sampling assignment</h2><p>Only the people named here receive the job. Nobody is assigned automatically.</p></div><span className="required-chip">REQUIRED TO SEND</span></div>
                <div className="form-grid">
                  <label><span>Accountable sampling employee *</span><select value={job.assignedEngineerId} onChange={e=>{const id=e.target.value;setJob(current=>({...current,assignedEngineerId:id,samplingTeamIds:current.samplingTeamIds.filter(x=>x!==id)}));setDispatchReview(false);setJobErrors([]);}}><option value="">Select employee</option><optgroup label="Sampling team">{samplingCandidates.filter(samplingDepartment).map(e=><option key={e.id} value={e.id}>{personLabel(e)}</option>)}</optgroup><optgroup label="Other employees with sampling access">{samplingCandidates.filter(e=>!samplingDepartment(e)).map(e=><option key={e.id} value={e.id}>{personLabel(e)}</option>)}</optgroup></select><small>Owns the sampling work and its report.</small></label>
                  <label><span>Driver *</span><select value={job.assignedDriverId} onChange={e=>{updateJob("assignedDriverId",e.target.value);setDispatchReview(false);}}><option value="">Select driver</option><optgroup label="Drivers">{driverCandidates.filter(isDriver).map(e=><option key={e.id} value={e.id}>{personLabel(e)}</option>)}</optgroup><optgroup label="Other active employees">{driverCandidates.filter(e=>!isDriver(e)).map(e=><option key={e.id} value={e.id}>{personLabel(e)}</option>)}</optgroup></select><small>Transports the samples after sampling-report approval.</small></label>
                  <fieldset className="full-field team-members"><legend>Supporting sampling employees (optional)</legend>{samplingCandidates.filter(e=>samplingDepartment(e)&&e.id!==job.assignedEngineerId).map(memberBox)}{samplingCandidates.some(e=>!samplingDepartment(e)&&e.id!==job.assignedEngineerId)&&<details><summary>Other employees with sampling access</summary>{samplingCandidates.filter(e=>!samplingDepartment(e)&&e.id!==job.assignedEngineerId).map(memberBox)}</details>}<small>Supporting employees see the job, its instructions and the sampling data. The accountable employee remains the single owner.</small></fieldset>
                </div>
                <p className="assignment-summary"><strong>Receives this job:</strong> {team.length ? team.map((id, index) => employeeName(id) + (index === 0 ? " (accountable)" : "")).join(", ") : "Nobody assigned yet"}{job.assignedDriverId ? ` · Driver: ${employeeName(job.assignedDriverId)}` : ""}</p>
              </section>

              <section className="panel instructions-panel">
                <div className="panel-heading"><span className="section-number">05</span><div><h2>Sampling instructions</h2><p>Explain the specific requirements and important notes for this job. The assigned sampling employees see this text with the job.</p></div><span className="required-chip">REQUIRED TO SEND</span></div>
                <label className="full-field instructions-field"><span>Sampling instructions *</span><textarea rows={6} value={job.samplingInstructions} onChange={(e) => updateJob("samplingInstructions", e.target.value)} placeholder="e.g. Collect 3 bottomhole samples at the stated depth. Confirm the sampling point with the client focal point before rig-up. Report any H₂S readings immediately." /></label>
                <label className="full-field"><span>Job / request description *</span><textarea rows={3} value={job.description} onChange={(e) => updateJob("description", e.target.value)} placeholder="Internal request summary and expected deliverables" /><small>{job.description.length} / 500</small></label>
              </section>

              {dispatchReview && editingDraft && <section className="panel ops-panel send-review" aria-live="polite"><h2>Review before sending to Sampling</h2><dl className="review-grid"><div><dt>Job</dt><dd>{jobId} · {clientName}</dd></div><div><dt>Location</dt><dd>{locationSummary(job, samplingType)}</dd></div><div><dt>Sampling</dt><dd>{samplingTypeLabel} · {job.requestedSampleCount} sample{job.requestedSampleCount === "1" ? "" : "s"}</dd></div><div><dt>Due date</dt><dd>{job.dueDate || "Not recorded"}</dd></div><div><dt>Receives the job</dt><dd>{team.map((id, index) => employeeName(id) + (index === 0 ? " (accountable)" : "")).join(", ")}</dd></div><div><dt>Driver</dt><dd>{employeeName(job.assignedDriverId)}</dd></div><div className="full-field"><dt>Sampling instructions</dt><dd className="instructions-text">{job.samplingInstructions}</dd></div><div className="full-field"><dt>Sign-off</dt><dd>No sign-off is recorded at job creation. The sampling report is approved later by {approver ? employeeName(approver) : "the sampling approver (not configured; ask an administrator)"}.</dd></div></dl><p>After sending, the job moves to <strong>Sampling</strong>; next action: {samplingIsRequired(samplingType) ? "complete sampling preparation" : "complete pre-job coordination"}. It appears in the assigned employees’ work lists. No email is sent.</p><Clarification id="initial-scope"/></section>}
              {jobErrors.length > 0 && <div className="preparation-validation" role="alert"><span>!</span><div><strong>{editingDraft ? "Job cannot be sent yet" : "Job cannot be saved"}</strong><ul>{jobErrors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}

              <div className="form-actions">{editingDraft ? <>{dispatchReview ? <button type="button" className="outline-button" onClick={() => setDispatchReview(false)}>Back to editing</button> : <button type="button" className="outline-button" onClick={saveDraft}>Save Draft</button>}<button type="submit" className="primary-button">{dispatchReview ? "Confirm & send to Sampling" : "Send to Sampling"} <span>→</span></button></> : <button type="submit" className="primary-button">Save job details <span>→</span></button>}</div>
            </form>;
          })()}

          {stage === "type" && (
            <>
              {preparationError.length > 0 && <div className="preparation-validation" role="alert"><span>!</span><div><strong>Preparation cannot be completed</strong><ul>{preparationError.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
              <section className="panel preparation-type-panel">
                <div className="panel-heading premium-heading"><div><span className="eyebrow">SAMPLING TYPE FROM JOB SETUP</span><h2>{samplingTypeLabel}</h2><p>{locationSummary(job, samplingType)}</p></div><span className="required-chip">LOCKED</span></div>
                <div className="carried-job-context">
                  <div><small>FIELD</small><strong>{job.fieldArea || "Not specified"}</strong></div>
                  <div><small>WELL</small><strong>{job.wellMode === "multiple" ? job.wells.filter(Boolean).join(", ") || "Not specified" : job.well || "Not specified"}</strong></div>
                  <div className="carried-job-note"><small>JOB / REQUEST DESCRIPTION</small><p>{job.description || "No description recorded in Job Setup."}</p></div>
                  <div className="carried-job-note"><small>SAMPLE QUANTITY NOTES</small><p>{job.sampleCountNotes || "No sample quantity notes recorded."}</p></div>
                  {scopeAttachment && <a href={scopeAttachment.dataUrl} download={scopeAttachment.name}>Open Scope of Work · {scopeAttachment.name}</a>}
                </div>
              </section>

              {samplingType && <section className="panel coordination-panel">
                <div className="panel-heading premium-heading"><div><span className="eyebrow">SAMPLING TEAM HANDOFF</span><h2>Pre-job coordination</h2><p>Complete and timestamp each required action before the job advances to Sampling Data.</p></div><span className="coordination-progress-badge">{coordinationTasks.filter((item) => item.completed).length} / {coordinationTasks.length} COMPLETE</span></div>
                {samplingIsRequired(samplingType) ? <div className="readiness-actions">
                  {coordinationTasks.map((task, index) => {
                    const contact = task.label === "Contact the field focal point";
                    const tools = task.label === "Confirm whether tools are required";
                    const availability = task.label === "Confirm tools availability";
                    const kit = task.label === "Assign the required sample kit";
                    const cylinders = task.label === "Assign the required cylinders";
                    const point = task.label.includes("sampling point");
                    const notApplicable = availability && coordinationDetails.toolsRequired === "Not Required";
                    const title = contact ? "Contact field focal point" : tools ? "Confirm tools required" : kit ? "Prepare sample kit" : cylinders ? "Prepare cylinders" : task.label;
                    return <details key={task.id} className="readiness-action">
                      <summary><span className="readiness-number">{task.completed ? "✓" : index + 1}</span><div><strong>{title}</strong><small>{task.completed ? `${employeeName(task.completedBy)} · ${formatDateTime(task.completedAt)}` : "Open to fill the required details"}</small></div><em>{notApplicable ? "Not Applicable" : task.completed ? "Completed" : "Pending"}</em></summary>
                      <div className="readiness-body">
                        {contact && <><div className="job-details-grid"><div><small>CLIENT FOCAL POINT</small><strong>{job.clientFocalPoint || "Not specified"}</strong></div><div><small>CONTACT NUMBER</small><strong>{job.clientFocalPointContact || "Not specified"}</strong></div><div><small>EMAIL</small><strong>{job.clientFocalPointEmail || "Not specified"}</strong></div></div><label>Contact notes (optional)<textarea rows={2} value={coordinationDetails.contactNotes || ""} onChange={(event) => updateCoordinationDetail("contactNotes", event.target.value)} /></label></>}
                        {tools && <label>Are tools required?<select value={coordinationDetails.toolsRequired} onChange={(event) => updateCoordinationDetail("toolsRequired", event.target.value)}>{["To Be Confirmed", "Required", "Not Required"].map((value) => <option key={value}>{value}</option>)}</select></label>}
                        {availability && (notApplicable ? <p>No tools are required. This check is not applicable.</p> : <><label>Tools availability<select disabled={coordinationDetails.toolsRequired !== "Required"} value={coordinationDetails.toolsAvailability === "Not Available" ? "Unavailable" : coordinationDetails.toolsAvailability} onChange={(event) => updateCoordinationDetail("toolsAvailability", event.target.value)}>{["To Be Confirmed", "Available", "Partially Available", "Unavailable"].map((value) => <option key={value}>{value}</option>)}</select></label>{coordinationDetails.toolsRequired !== "Required" && <p>Confirm whether tools are required first.</p>}{["Partially Available", "Unavailable", "Not Available"].includes(coordinationDetails.toolsAvailability) && <label>Missing tools / items<textarea rows={3} value={coordinationDetails.missingTools || ""} onChange={(event) => updateCoordinationDetail("missingTools", event.target.value)} /></label>}</>)}
                        {kit && <label>Sample kit details *<textarea rows={3} value={coordinationDetails.requiredSampleKit} onChange={(event) => updateCoordinationDetail("requiredSampleKit", event.target.value)} placeholder="Kit type, quantity and reference" /></label>}
                        {cylinders && <><p>Receiving bottles from the sample records. Complete their details below before confirming Ready.</p><div className="readiness-bottles">{samples.map((sample) => <div key={sample.id}><strong>Sample {sample.id}</strong><CylinderPicker inventory={bottleInventory} sample={sample} onSelect={(serial) => updatePreparationSample(sample.id, "bottleSerial", serial)} onField={(field, value) => updatePreparationSample(sample.id, field, value)} />{isSpmcFieldSampling(samplingType) && <section className="cylinder-record-notes"><label>Remarks<input value={sample.preparationRemarks} onChange={(event) => updatePreparationSample(sample.id, "preparationRemarks", event.target.value)} placeholder="Equipment condition, exceptions, or handling notes" /></label><div><small>PREPARED BY</small><strong>{employeeName(sample.preparedBy || currentEmployee.id)}</strong><small>PREPARATION DATE / TIME</small><strong>{formatDateTime(sample.preparedAt || preparationStartedAt)}</strong></div><button type="button" className="remove-sample-button" onClick={() => removeSample(sample.id)}>Remove sample</button></section>}</div>)}</div></>}
                        {point && <>{task.label.includes("type") && <label>Sampling point type *<input value={coordinationDetails.samplingPointType} onChange={(event) => updateCoordinationDetail("samplingPointType", event.target.value)} /></label>}{task.label.includes("size") && <label>Sampling point size *<input value={coordinationDetails.samplingPointSize} onChange={(event) => updateCoordinationDetail("samplingPointSize", event.target.value)} /></label>}{task.label === "Confirm separator sampling point" && <label>Separator sampling point *<input value={job.samplingPoint} onChange={(event) => { updateJob("samplingPoint", event.target.value); if (task.completed) toggleCoordinationTask(task.id, false); }} /></label>}</>}
                        {!tools && !availability && <button type="button" className={task.completed ? "outline-button" : "primary-button"} onClick={() => toggleCoordinationTask(task.id, !task.completed)}>{task.completed ? "Reopen" : contact ? "Contacted" : kit || cylinders ? "Ready" : "Confirm"}</button>}
                      </div>
                    </details>;
                  })}
                </div> : <>
                <div className="coordination-grid">
                  <div className="coordination-task-list">{coordinationTasks.map((task, index) => <label key={task.id} className={task.completed ? "completed" : ""}><input type="checkbox" checked={task.completed} onChange={(event) => toggleCoordinationTask(task.id, event.target.checked)} /><span>{task.completed ? "✓" : index + 1}</span><div><strong>{task.label}</strong><small>{task.completed ? `${employeeName(task.completedBy)} · ${formatDateTime(task.completedAt)}` : "Pending sampling team action"}</small></div></label>)}</div>
                  <div className="coordination-fields">
                    {isMpsrLabTransfer(samplingType) ? <>
                      <label><span>Sample Owner *</span><input value={coordinationDetails.sampleOwner} onChange={(event) => updateCoordinationDetail("sampleOwner", event.target.value)} placeholder="Name / organization responsible for samples" /></label>
                      <label className="full-field"><span>Required Transfer Items *</span><textarea rows={4} value={coordinationDetails.requiredItems} onChange={(event) => updateCoordinationDetail("requiredItems", event.target.value)} placeholder="List transfer kit, restoration equipment, containers, documents, or other items" /></label>
                    </> : <>
                      <label><span>Tools Required? *</span><select value={coordinationDetails.toolsRequired} onChange={(event) => updateCoordinationDetail("toolsRequired", event.target.value)}>{["To Be Confirmed", "Required", "Not Required"].map((option) => <option key={option}>{option}</option>)}</select>{coordinationDetails.toolsConfirmedBy && <small className="field-confirmation">Confirmed by {employeeName(coordinationDetails.toolsConfirmedBy)} · {formatDateTime(coordinationDetails.toolsConfirmedAt)}</small>}</label>
                      <label><span>Tools Availability</span><select value={coordinationDetails.toolsAvailability} onChange={(event) => updateCoordinationDetail("toolsAvailability", event.target.value)}>{["To Be Confirmed", "Available", "Not Available", "Not Applicable"].map((option) => <option key={option}>{option}</option>)}</select></label>
                      {(samplingType === "Wellhead Sampling" || samplingType === "Separator Sampling") && <><label><span>Sampling Point Type *</span><input value={coordinationDetails.samplingPointType} onChange={(event) => updateCoordinationDetail("samplingPointType", event.target.value)} placeholder="e.g. valve, port, probe" /></label><label><span>Sampling Point Size *</span><input value={coordinationDetails.samplingPointSize} onChange={(event) => updateCoordinationDetail("samplingPointSize", event.target.value)} placeholder="e.g. 1/4 in, 1/2 in" /></label></>}
                      {samplingType === "Separator Sampling" && <label className="full-field"><span>Separator Sampling Point *</span><input value={job.samplingPoint} onChange={(event) => updateJob("samplingPoint", event.target.value)} placeholder="Describe the exact separator sampling point" /></label>}
                      <label><span>Required Sample Kit *</span><input value={coordinationDetails.requiredSampleKit} onChange={(event) => updateCoordinationDetail("requiredSampleKit", event.target.value)} placeholder="Kit type, quantity, or reference" /></label>
                      <label><span>Required Cylinders *</span><input value={coordinationDetails.requiredCylinders} onChange={(event) => updateCoordinationDetail("requiredCylinders", event.target.value)} placeholder="Cylinder type and quantity" /></label>
                    </>}
                  </div>
                </div>
                </>}
                <div className="coordination-progress"><span><i style={{ width: `${coordinationTasks.length ? (coordinationTasks.filter((item) => item.completed).length / coordinationTasks.length) * 100 : 0}%` }} /></span><small>Every completed action is added automatically to the Sequence of Events with employee and time.</small></div>
              </section>}

              {samplingType && <>
                <section className="preparation-controls simple-sample-bar" aria-label="Sample count and add sample">
                  <strong className="sample-total" aria-live="polite">Samples: {samples.length}</strong>
                  <button type="button" className="add-extra-sample" onClick={addExtraSample} disabled={samples.length >= 20}>{samples.length >= 20 ? "Maximum 20 samples" : "+ Add Sample"}</button>
                </section>
              </>}
              {requiresEquipmentPreparation(samplingType) && <>
                {isSpmcFieldSampling(samplingType) && samples[0] && <section className="panel general-sampler-panel">
                  <div className="panel-heading premium-heading"><div><span className="eyebrow">SHARED FIELD EQUIPMENT</span><h2>SPMC Sampler</h2><p>This sampler applies to every bottle and sample record below.</p></div><span className={samples[0].samplerSerial ? "sample-status complete" : "sample-status"}>{samples[0].samplerSerial ? "SAMPLER READY" : "SERIAL REQUIRED"}</span></div>
                  <div className="compact-fields three"><label><span>Sampler Type *</span><select value="SPMC" disabled><option>SPMC</option></select></label><label><span>Sampler Serial Number *</span><input value={samples[0].samplerSerial} onChange={(event) => updateGeneralSampler("samplerSerial", event.target.value)} placeholder="e.g. SPMC-24018" /></label><label><span>Calibration Status</span><select value={samples[0].calibrationStatus} onChange={(event) => updateGeneralSampler("calibrationStatus", event.target.value)}>{["Valid", "Expired", "Not Required", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Pressure Test Status</span><select value={samples[0].pressureTestStatus} onChange={(event) => updateGeneralSampler("pressureTestStatus", event.target.value)}>{["Passed", "Failed", "Not Required", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Equipment Condition</span><select value={samples[0].equipmentCondition} onChange={(event) => updateGeneralSampler("equipmentCondition", event.target.value)}>{["Good", "Requires Attention", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label></div>
                </section>}
                {isCasedHoleSampling(samplingType) && samples.length < 3 && <div className="sample-count-warning"><span>!</span>Cased Hole sampling requires at least 3 samples for completion. Add a preparation note to document any draft plan below this minimum.</div>}

                {!isSpmcFieldSampling(samplingType) && <div className="preparation-layout preparation-layout-single">
                  <section className="panel preparation-samples-panel">
                    <div className="panel-heading premium-heading"><div><span className="eyebrow">{isSpmcFieldSampling(samplingType) ? "BOTTLE AND SAMPLE REGISTER" : "EQUIPMENT PREPARATION"}</span><h2>{isSpmcFieldSampling(samplingType) ? "Bottle / sample details" : "Sample preparation cards"}</h2><p>{isSpmcFieldSampling(samplingType) ? "Record each receiving bottle separately under the shared SPMC sampler." : "Verify the sampler, receiving bottle, and equipment readiness for every planned sample."}</p></div><span className="client-total">{samples.filter((sample) => sample.samplerSerial && sample.bottleSerial).length} / {samples.length} READY</span></div>
                    <div className="preparation-accordion">
                      {samples.map((sample, index) => { const ready = Boolean(sample.sampler && sample.samplerSerial && containerComplete(sample)); return <article className={expanded === sample.id ? "preparation-sample open" : "preparation-sample"} key={sample.id}>
                        <button type="button" className="preparation-sample-toggle" onClick={() => setExpanded(expanded === sample.id ? "" : sample.id)} aria-expanded={expanded === sample.id}><span className="sample-index">{String(index + 1).padStart(2, "0")}</span><div><strong>Sample {sample.id}</strong><small>{isSpmcFieldSampling(samplingType) ? containerLabel(sample, containerNoun(sample) + " pending") : `${sample.sampler} · ${sample.samplerSerial || "Sampler serial pending"} / ${containerLabel(sample, containerNoun(sample) + " pending")}`}</small></div><span className={ready ? "sample-status complete" : "sample-status"}>{ready ? "Prepared" : "Details required"}</span><b>⌄</b></button>
                        {expanded === sample.id && <div className="preparation-sample-body">
                          {!isSpmcFieldSampling(samplingType) && <section className="equipment-group sampler-group"><header><span>↓</span><div><small>DOWNHOLE EQUIPMENT</small><h3>Downhole Sampler</h3></div></header><div className="compact-fields"><label><span>Sampler Type *</span><select value={sample.sampler} onChange={(event) => updatePreparationSample(sample.id, "sampler", event.target.value)}>{samplerTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label><span>Sampler Serial Number *</span><input value={sample.samplerSerial} onChange={(event) => updatePreparationSample(sample.id, "samplerSerial", event.target.value)} placeholder="e.g. SPS-24018" /></label></div></section>}
                          <section className="equipment-group bottle-group"><header><span>▯</span><div><small>SAMPLE CONTAINMENT</small><h3>Receiving Bottle / Container</h3></div></header><CylinderPicker inventory={bottleInventory} sample={sample} onSelect={(serial) => updatePreparationSample(sample.id, "bottleSerial", serial)} onField={(field, value) => updatePreparationSample(sample.id, field, value)} /></section>
                          {!isSpmcFieldSampling(samplingType) && <section className="equipment-group checks-group"><header><span>✓</span><div><small>READINESS VERIFICATION</small><h3>Equipment Checks</h3></div></header><div className="compact-fields three"><label><span>Calibration Status</span><select value={sample.calibrationStatus} onChange={(event) => updatePreparationSample(sample.id, "calibrationStatus", event.target.value)}>{["Valid", "Expired", "Not Required", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Pressure Test Status</span><select value={sample.pressureTestStatus} onChange={(event) => updatePreparationSample(sample.id, "pressureTestStatus", event.target.value)}>{["Passed", "Failed", "Not Required", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Equipment Condition</span><select value={sample.equipmentCondition} onChange={(event) => updatePreparationSample(sample.id, "equipmentCondition", event.target.value)}>{["Good", "Requires Attention", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label></div></section>}
                          <section className="preparation-tracking"><div><small>PREPARED BY</small><strong>{employeeName(sample.preparedBy || currentEmployee.id)}</strong></div><div><small>PREPARATION DATE / TIME</small><strong>{formatDateTime(sample.preparedAt || preparationStartedAt)}</strong></div><label><span>Remarks</span><input value={sample.preparationRemarks} onChange={(event) => updatePreparationSample(sample.id, "preparationRemarks", event.target.value)} placeholder="Equipment condition, exceptions, or handling notes" /></label><button type="button" className="remove-sample-button" onClick={() => removeSample(sample.id)}>Remove sample</button></section>
                        </div>}
                      </article>; })}
                    </div>
                    <label className="preparation-notes compact-preparation-notes"><span>Preparation Notes <em>Optional</em></span><textarea rows={3} value={preparationNotes} onChange={(event) => { setPreparationNotes(event.target.value); setPreparationError([]); }} placeholder="Add preparation exceptions or special arrangements when needed…" /></label>
                  </section>
                </div>}
                {isSpmcFieldSampling(samplingType) && <label className="preparation-notes compact-preparation-notes"><span>Preparation Notes <em>Optional</em></span><textarea rows={3} value={preparationNotes} onChange={(event) => { setPreparationNotes(event.target.value); setPreparationError([]); }} placeholder="Add preparation exceptions or special arrangements when needed…" /></label>}

                <section className="preparation-footer">
                  <div><small>PREPARATION TRACKING</small><strong>Prepared by {currentEmployee.name}</strong><span>Started {formatDateTime(preparationStartedAt)}</span>{preparationCompletedAt && <span>Completed {formatDateTime(preparationCompletedAt)}</span>}</div>
                  <div><button type="button" className="text-button" onClick={() => setStage("job")}>← Back</button><button type="button" className="outline-button" onClick={savePreparationDraft}>Save Draft</button><button type="button" className="primary-button" onClick={completePreparation}>Complete Preparation &amp; Continue <span>→</span></button></div>
                </section>
              </>}
              {samplingType && !requiresEquipmentPreparation(samplingType) && <section className="panel source-preparation-placeholder"><div className="future-workflow-note"><span>✓</span><div><strong>{isMpsrLabTransfer(samplingType) ? "Transfer coordination and custody control" : "Source preparation and logistics"}</strong><p>Complete the tracked coordination checklist above before advancing this job to Sampling Data.</p></div></div><div className="preparation-footer"><div><small>PREPARATION TRACKING</small><strong>Assigned to {currentEmployee.name}</strong><span>{coordinationTasks.filter((item) => item.completed).length} of {coordinationTasks.length} coordination actions completed.</span></div><div><button type="button" className="text-button" onClick={() => setStage("job")}>← Back</button><button type="button" className="outline-button" onClick={savePreparationDraft}>Save Draft</button><button type="button" className="primary-button" onClick={completeSourcePreparation}>Complete Preparation &amp; Continue <span>→</span></button></div></div></section>}
              {!samplingType && <button type="button" className="back-link" onClick={() => setStage("job")}>← Back to job details</button>}
            </>
          )}

          {stage === "scope" && report.reportStatus === "Completed" && !!report.approvedBy && report.approvedAt && (
            <section className="final-report-ready panel"><div className="scope-route"><span>✓</span><div><strong>Final report generated</strong><small>{jobId} · {report.reportStatus} · Approved by {employeeName(report.approvedBy)}</small></div></div><div className="final-report-actions"><button type="button" className="text-button" onClick={() => setStage("report")}>← Back to report preview</button>{scopeAttachment && <a className="outline-button" href={scopeAttachment.dataUrl} download={scopeAttachment.name}>Open Scope of Work</a>}<button type="button" className="primary-button" onClick={downloadReportPdf} disabled={pdfExporting}>{pdfExporting ? "Preparing PDF..." : "Download PDF"}</button></div></section>
          )}

          {stage === "bottomhole" && isCasedHoleSampling(samplingType) && (
            <>
              {Object.values(sampleDataErrors).some((errors) => errors.length) && <div className="sampling-data-validation" role="alert"><span>!</span><div><strong>Sampling Data requires attention</strong><p>Complete the highlighted sample records before continuing.</p></div></div>}

              <section className="sampling-data-overview">
                <div><span className="sample-symbol">↓</span><div><small>SAMPLING SOURCE / METHOD</small><strong>Cased Hole (Bottomhole / Downhole Sampling)</strong></div></div>
                <div><small>SAMPLES LOADED FROM PREPARATION</small><strong>{samples.length}</strong><span>{samples.map((sample) => sample.id).join(" · ")}</span></div>
                <div><small>COMPLETED SAMPLE RECORDS</small><strong>{samples.filter((sample) => sample.dataComplete).length} / {samples.length}</strong><span>{samples.filter((sample) => sample.dataComplete).length === samples.length ? "Ready to continue" : "Complete each sample below"}</span></div>
              </section>

              <section className="panel sampling-data-panel">
                <div className="panel-heading premium-heading"><div><span className="eyebrow">FIELD DATA CAPTURE</span><h2>Prepared sample records</h2><p>Preparation references are locked. Expand a sample to enter its field conditions and transfer record.</p></div><span className="client-total">{samples.filter((sample) => sample.dataComplete).length} / {samples.length} COMPLETE</span></div>
                <div className="sampling-data-accordion">
                  {samples.map((sample, index) => { const status = sampleDataStatus(sample); return <article className={expanded === sample.id ? "sampling-data-sample open" : "sampling-data-sample"} key={sample.id}>
                    <button type="button" className="sampling-data-toggle" onClick={() => setExpanded(expanded === sample.id ? "" : sample.id)} aria-expanded={expanded === sample.id}>
                      <span className="sample-index">{String(index + 1).padStart(2, "0")}</span>
                      <div className="sample-heading"><strong>Sample {sample.id}</strong><small>{sample.sampler} · {sample.samplerSerial || "Serial pending"} / {containerLabel(sample, containerNoun(sample) + " pending")}</small></div>
                      <div className="sample-date"><small>SAMPLING DATE / TIME</small><strong>{sample.fieldData.samplingDate || sample.fieldData.samplingTime ? `${sample.fieldData.samplingDate || "Date pending"} · ${sample.fieldData.samplingTime || "Time pending"}` : "Not recorded"}</strong></div>
                      <span className={`data-status ${status.toLowerCase().replace(" ", "-")}`}>{status}</span><b>⌄</b>
                    </button>
                    {expanded === sample.id && <div className="sampling-data-body">
                      <section className="preparation-reference"><header><div><small>READ-ONLY REFERENCE</small><h3>Sampling Preparation</h3></div><span>Locked</span></header><div className="preparation-reference-grid">
                        <div><small>SAMPLE</small><strong>{sample.id}</strong></div><div><small>SAMPLER TYPE</small><strong>{sample.sampler}</strong></div><div><small>SAMPLER SERIAL</small><strong>{sample.samplerSerial || "Not specified"}</strong></div>{isGlass(sample) ? <><div><small>CONTAINER TYPE</small><strong>Glass container</strong></div><div><small>CONTAINER ID</small><strong>{containerId(sample) || "Not specified"}</strong></div></> : <><div><small>BOTTLE TYPE</small><strong>{sample.bottle}</strong></div><div><small>BOTTLE SERIAL</small><strong>{sample.bottleSerial || "Not specified"}</strong></div><div><small>BOTTLE CAPACITY</small><strong>{sample.bottleCapacity || "Not specified"}</strong></div></>}<div><small>PREPARED BY</small><strong>{employeeName(sample.preparedBy)}</strong></div><div><small>PREPARED DATE / TIME</small><strong>{formatDateTime(sample.preparedAt)}</strong></div>
                      </div></section>

                      {standardDataSheetForm(sample)}
                      {sampleDataErrors[sample.id]?.length > 0 && <div className="sample-data-errors" role="alert"><strong>Complete the following:</strong><ul>{sampleDataErrors[sample.id].map((error) => <li key={error}>{error}</li>)}</ul></div>}
                      <footer className="sample-completion-bar"><div><small>DATA ENTRY TRACKING</small><strong>{sample.dataComplete ? `Completed by ${employeeName(sample.dataCompletedBy)}` : `Data entered by ${currentEmployee.name}`}</strong><span>{sample.dataComplete ? formatDateTime(sample.dataCompletedAt) : "Complete the required identification fields to finish this record."}</span></div><button type="button" className={sample.dataComplete ? "outline-button completed-button" : "primary-button"} onClick={() => markSampleComplete(sample.id)}>{sample.dataComplete ? "✓ Sample Complete" : "Mark Sample Complete"}</button></footer>
                    </div>}
                  </article>; })}
                </div>
              </section>

              <section className="sampling-data-footer"><div><small>SAMPLING DATA TRACKING</small><strong>{samplingDataCompletedAt ? `Completed by ${currentEmployee.name}` : `Assigned to ${employeeName(currentJob?.responsibleId || currentEmployee.id)}`}</strong><span>{samplingDataCompletedAt ? formatDateTime(samplingDataCompletedAt) : `${samples.filter((sample) => sample.dataComplete).length} of ${samples.length} samples complete`}</span></div><div><button type="button" className="text-button" onClick={() => setStage("type")}>← Back to Preparation</button><button type="button" className="outline-button" onClick={saveSamplingDataDraft}>Save Draft</button><button type="button" className="primary-button" onClick={completeSamplingData}>Complete Sampling Data &amp; Continue <span>→</span></button></div></section>
            </>
          )}

          {stage === "bottomhole" && samplingType && !isCasedHoleSampling(samplingType) && (
            <>
              <section className="sampling-data-overview source-aware-overview"><div><span className="sample-symbol">{samplingType === "Wellhead Sampling" ? "↕" : samplingType === "Separator Sampling" ? "◉" : "+"}</span><div><small>SAMPLING SOURCE / METHOD</small><strong>{samplingTypeLabel}</strong></div></div><div><small>CONTEXTUAL LOCATION</small><strong>{locationSummary(job, samplingType)}</strong><span>Loaded from Sampling Preparation</span></div><div><small>DATA MODEL</small><strong>Standard Data Sheet</strong><span>Required for every sample</span></div></section>
              <section className="panel source-data-panel"><div className="panel-heading premium-heading"><div><span className="eyebrow">SAMPLING CONTEXT</span><h2>{samplingTypeLabel} data</h2><p>Record the source-level context, then complete the standard data sheet for every sample below.</p></div><span className="required-chip">REQUIRED</span></div><div className="form-grid source-data-grid">
                {samplingType === "Wellhead Sampling" && <><label><span>WHP if known</span><input value={job.whp} onChange={(event) => updateJob("whp", event.target.value)} /></label><label><span>WHT if known</span><input value={job.wht} onChange={(event) => updateJob("wht", event.target.value)} /></label><label className="full-field"><span>Wellhead Conditions / Notes</span><textarea rows={4} value={job.locationNotes} onChange={(event) => updateJob("locationNotes", event.target.value)} /></label></>}
                {samplingType === "Separator Sampling" && <><label><span>Separator Pressure if known</span><input value={job.separatorPressure} onChange={(event) => updateJob("separatorPressure", event.target.value)} /></label><label><span>Separator Temperature if known</span><input value={job.separatorTemperature} onChange={(event) => updateJob("separatorTemperature", event.target.value)} /></label><label><span>Choke Size</span><input value={job.chokeSize} onChange={(event) => updateJob("chokeSize", event.target.value)} /></label><label><span>Oil Rate</span><input value={job.oilRate} onChange={(event) => updateJob("oilRate", event.target.value)} /></label><label><span>Gas Rate</span><input value={job.gasRate} onChange={(event) => updateJob("gasRate", event.target.value)} /></label><label><span>Water Rate</span><input value={job.waterRate} onChange={(event) => updateJob("waterRate", event.target.value)} /></label><label><span>Sampling Point</span><input value={job.samplingPoint} onChange={(event) => updateJob("samplingPoint", event.target.value)} /></label></>}
                {samplingType === "Other" && <><label><span>Location / Facility</span><input value={job.facility} onChange={(event) => updateJob("facility", event.target.value)} /></label><label><span>Sampling Point</span><input value={job.samplingPoint} onChange={(event) => updateJob("samplingPoint", event.target.value)} /></label><label className="full-field"><span>Description</span><textarea rows={5} value={job.otherDescription} onChange={(event) => updateJob("otherDescription", event.target.value)} /></label></>}
              </div></section>
              <section className="panel generic-samples-panel"><div className="panel-heading premium-heading"><div><span className="eyebrow">STANDARD DATA SHEETS</span><h2>Individual sample data sheets</h2><p>The same controlled data sheet is required for every sample and every sampling situation.</p></div><button type="button" className="outline-button" onClick={addSample}>+ Add Sample</button></div><div className="generic-sample-list">{samples.map((sample) => <article key={sample.id}><header><strong>Sample {sample.id}</strong><span className={`data-status ${sampleDataStatus(sample).toLowerCase().replace(" ", "-")}`}>{sampleDataStatus(sample)}</span><button type="button" onClick={() => removeSample(sample.id)}>Remove</button></header><section className="data-section generic-bottle-reference"><header><span>00</span><div><small>SAMPLE CONTAINER</small><h3>Bottle / Container Reference</h3></div></header><CylinderPicker inventory={bottleInventory} sample={sample} onSelect={(serial) => updatePreparationSample(sample.id, "bottleSerial", serial)} onField={(field, value) => updatePreparationSample(sample.id, field, value)} /></section>{standardDataSheetForm(sample)}{sampleDataErrors[sample.id]?.length > 0 && <div className="sample-data-errors"><strong>Complete the following:</strong><ul>{sampleDataErrors[sample.id].map((error) => <li key={error}>{error}</li>)}</ul></div>}<footer className="sample-completion-bar"><div><small>DATA ENTRY TRACKING</small><strong>{sample.dataComplete ? `Completed by ${employeeName(sample.dataCompletedBy)}` : `Data entered by ${currentEmployee.name}`}</strong><span>{sample.dataComplete ? formatDateTime(sample.dataCompletedAt) : "Complete every standard data-sheet section to finish this record."}</span></div><button type="button" className={sample.dataComplete ? "outline-button completed-button" : "primary-button"} onClick={() => markSampleComplete(sample.id)}>{sample.dataComplete ? "✓ Sample Complete" : "Mark Sample Complete"}</button></footer></article>)}</div></section>
              <section className="sampling-data-footer"><div><small>SAMPLING DATA TRACKING</small><strong>Entered by {currentEmployee.name}</strong><span>{locationSummary(job, samplingType)}</span></div><div><button type="button" className="text-button" onClick={() => setStage("type")}>← Back to Preparation</button><button type="button" className="outline-button" onClick={saveSamplingDataDraft}>Save Draft</button><button type="button" className="primary-button" onClick={completeSamplingData}>Complete Sampling Data &amp; Continue <span>→</span></button></div></section>
            </>
          )}

          {samplingFlow && stage === "report" && (() => {
            const issues = samplingIssues({ samplingSource: samplingType, samples, stages: currentJob!.stages });
            const lead = currentJob!.assignedEngineerId;
            const isLead = currentEmployee.id === lead;
            const report = latest(currentJob!.operations?.samplingReports || []);
            const goTo = (target: string) => { const sample = target.startsWith("sample:") ? target.split(":")[1] : ""; setStage(target === "preparation" || target === "job" ? "type" : "bottomhole"); if (sample) setExpanded(sample); };
            return !reviewPhase && !currentSamplingStatus!.key.startsWith("report") ? <section className="panel step-guide submit-step"><div><span className="eyebrow">STEP 3 OF 4</span><h2>Review &amp; submit sampling data</h2><p>Check that preparation, every sample’s container and every data sheet are complete. {employeeName(lead)} submits the data to {samplingApprover ? employeeName(samplingApprover) : "the sampling approver (not configured)"} for review. The sampling report is prepared only after the data is approved.</p>
              <ul className="completeness-list"><li className={issues.some((issue) => issue.target === "preparation") ? "missing" : "ok"}>{issues.some((issue) => issue.target === "preparation") ? "✗" : "✓"} Preparation</li>{samples.map((sample) => { const own = issues.filter((issue) => issue.target.startsWith(`sample:${sample.id}`)); return <li key={sample.id} className={own.length ? "missing" : "ok"}>{own.length ? "✗" : "✓"} Sample {sample.id} · {containerLabel(sample, "container not recorded")} · {sample.dataComplete ? "data sheet complete" : "data sheet not complete"}</li>; })}</ul>
              {issues.length > 0 && <div className="preparation-validation" role="alert"><span>!</span><div><strong>Complete before submitting</strong><ul>{issues.map((issue, index) => <li key={index}>{issue.label}: {issue.text} <button type="button" className="text-button" onClick={() => goTo(issue.target)}>Open →</button></li>)}</ul></div></div>}
              <label>Submission note (optional)<textarea value={submissionNote} onChange={(event) => setSubmissionNote(event.target.value)} placeholder="Anything the reviewer should know" /></label>
              <div className="form-actions"><button type="button" className="outline-button" onClick={saveSamplingDataDraft}>Save Draft</button>{isLead ? <button type="button" className="primary-button" disabled={issues.length > 0} onClick={submitSamplingData}>{dataReview?.status === "Returned" ? "Resubmit sampling data" : "Submit sampling data for review"} <span>→</span></button> : <p className="required-legend">Only {employeeName(lead)} (accountable) can submit. You can still enter and save data.</p>}</div>
            </div></section> : <section className="panel step-guide"><div><span className="eyebrow">STEP 4 OF 4</span><h2>Review status &amp; sampling report</h2><p><strong>{currentSamplingStatus!.label}</strong> · Next: {currentSamplingStatus!.next}{currentSamplingStatus!.owner ? ` (${employeeName(currentSamplingStatus!.owner)})` : ""}</p><dl className="ops-facts"><div><dt>Data submitted</dt><dd>{dataReview && dataReview.status !== "Reopened" ? `${employeeName(dataReview.submittedBy)} · ${formatDateTime(dataReview.submittedAt)}` : "—"}</dd></div><div><dt>Data review</dt><dd>{dataReview?.status === "Approved" ? `Approved by ${employeeName(dataReview.reviewedBy)} · ${formatDateTime(dataReview.reviewedAt)}` : dataReview?.status || "—"}</dd></div><div><dt>Sampling report</dt><dd>{report ? `Version ${report.version} · ${report.status}` : "Not generated"}</dd></div><div><dt>Report approval</dt><dd>{report?.approvedAt ? `${employeeName(report.approvedBy)} · ${formatDateTime(report.approvedAt)}` : "Pending"}</dd></div></dl></div><div className="step-guide-status"><button type="button" className="primary-button" onClick={() => openOperation(currentJob!, "sampling-report")}>Open sampling review &amp; report →</button></div></section>;
          })()}

          {(stage === "report" || stage === "scope") && samplingType && !samplingFlow && (
            <>
              {(stage === "report" || report.reportStatus !== "Completed") && <>
                {reportErrors.length > 0 && <div className="preparation-validation report-validation" role="alert"><span>!</span><div><strong>Report cannot be submitted</strong><ul>{reportErrors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
                <section className="panel report-controls">
                  <div className="panel-heading premium-heading"><div><span className="eyebrow">DATA REVIEW &amp; APPROVAL</span><h2>Sampling and transfer data review</h2><p>Review all entered details below. The sampling report becomes available only after {employeeName(samplingApprover)} (sampling approval) approves it.</p></div><span className="required-chip">{report.reportStatus.toUpperCase()}</span></div>
                  <label className="report-summary-editor"><span>Executive Summary *</span><textarea rows={5} value={report.summary} disabled={report.reportStatus !== "Draft"} onChange={(event) => { setReport((current) => ({ ...current, summary: event.target.value })); setReportErrors([]); }} /></label>
                  <div className="report-approval-grid"><label><span>Prepared By *</span><select value={report.preparedBy} disabled={report.reportStatus !== "Draft"} onChange={(event) => setReport((current) => ({ ...current, preparedBy: event.target.value }))}><option value="">Select employee</option>{demoEmployees.filter(e=>e.active || e.id===report.preparedBy).map((employee) => <option disabled={!employee.active} value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label><label><span>Prepared Date *</span><input type="date" value={report.preparedDate} disabled={report.reportStatus !== "Draft"} onChange={(event) => setReport((current) => ({ ...current, preparedDate: event.target.value }))} /></label><label><span>Send To / Approver *</span><input value={report.approvedBy ? employeeName(report.approvedBy) : samplingApprover ? employeeName(samplingApprover) : "Not configured"} readOnly /></label><label><span>Approval Date</span><input value={report.approvalDate ? reportDate(report.approvalDate) : "Recorded automatically"} readOnly /></label></div>
                  {report.reportStatus === "Awaiting Approval" && <div className="approval-handoff-card"><div><span>APPROVAL REQUEST</span><strong>Sent to {employeeName(samplingApprover)}</strong><small>Submitted by {employeeName(report.submittedBy)} · {formatDateTime(report.submittedAt)}</small></div>{currentEmployee.id === samplingApprover ? <div><button type="button" className="outline-button" onClick={requestReportChanges}>Request Changes</button><button type="button" className="primary-button" onClick={approveFinalReport}>Approve &amp; Finalize Report <span>→</span></button></div> : <em>Waiting for the assigned approver</em>}</div>}
                  <div className="report-toolbar"><button type="button" className="text-button" disabled={report.reportStatus !== "Draft"} onClick={() => setStage("bottomhole")}>← Edit sampling data</button><div><button type="button" className="outline-button" onClick={saveReportDraft} disabled={report.reportStatus !== "Draft"}>Save Draft</button>{report.reportStatus === "Completed" && !!report.approvedBy && report.approvedAt && <><button type="button" className="outline-button" onClick={() => window.print()}>Print Report</button><button type="button" className="outline-button" onClick={downloadReportPdf} disabled={pdfExporting}>{pdfExporting ? "Preparing PDF..." : "Download PDF"}</button></>}<button type="button" className="primary-button" onClick={submitReportForApproval} disabled={report.reportStatus !== "Draft"}>{report.reportStatus === "Awaiting Approval" ? "Sent for Approval" : "Open checking & approval"} <span>→</span></button></div></div>
                </section>
              </>}

              {report.reportStatus !== "Completed" && <section className="panel approval-data-review"><h2>Full data for approval</h2><h3>Job and sampling context</h3><ReviewData value={{ jobId, clientName, samplingType, ...Object.fromEntries(Object.entries(job).filter(([key]) => !["requiredTests", "otherTests"].includes(key))) }} /><h3>Preparation and coordination</h3><ReviewData value={{ coordinationDetails, coordinationTasks }} />{scopeAttachment && <a href={scopeAttachment.dataUrl} download={scopeAttachment.name}>Review scope of work: {scopeAttachment.name}</a>}<h3>All sample and transfer records</h3>{samples.map(sample => <section key={sample.id}><h4>Sample {sample.id}</h4><ReviewData value={sample} /></section>)}<h3>Sequence of events</h3><ReviewData value={{ events: sortedEvents }} /></section>}
              {report.reportStatus === "Completed" && !!report.approvedBy && report.approvedAt && <article className="report-sheet final-sampling-report" data-pdf-report>
                <section className="report-page report-cover-page">
                  <div className="report-accent-line" />
                  <header className="cover-brand"><img src="/vaps-logo.png" alt="VAPS" /><span>Petroleum Laboratory Services</span></header>
                  <div className="cover-client"><small>PREPARED FOR</small><strong>{selectedClient?.name || clientName}</strong></div>
                  <div className="cover-title"><span>TECHNICAL REPORT</span><h2>Sampling and<br />Analysis Report</h2><p>{job.well || "Well not specified"}</p></div>
                  <div className="cover-reference"><div><small>JOB NUMBER</small><strong>{jobId}</strong></div><div><small>TEST / SAMPLING ENVIRONMENT</small><strong>{samplingTypeLabel}</strong></div><div><small>REPORT DATE</small><strong>{reportDate(report.preparedDate || job.dateReceived)}</strong></div><div><small>REVISION</small><strong>00</strong></div></div>
                  <div className="cover-approval"><div><small>PREPARED BY</small><strong>{employeeName(report.preparedBy)}</strong><span>{reportDate(report.preparedDate)}</span></div><div><small>APPROVED BY</small><strong>{employeeName(report.approvedBy)}</strong><span>{reportDate(report.approvalDate)}</span></div></div>
                  <footer><span>VISION ADVANCED PETROLEUM SOLUTIONS</span><span>CONFIDENTIAL TECHNICAL DOCUMENT</span></footer>
                </section>

                <section className="report-page report-content-page">
                  <header className="report-document-header"><div className="report-brand"><img src="/vaps-logo.png" alt="VAPS" /><small>Sampling and Analysis Report</small></div><div><p>JOB NUMBER</p><strong>{jobId}</strong><span>Revision 00 - {report.reportStatus}</span></div></header>
                  <section className="report-page-meta"><div><small>CLIENT</small><strong>{clientName || "Not specified"}</strong></div><div><small>JOB NO.</small><strong>{jobId}</strong></div><div><small>DATE</small><strong>{reportDate(job.dateReceived)}</strong></div><div><small>FIELD</small><strong>{job.fieldArea || "Not specified"}</strong></div><div><small>WELL</small><strong>{job.well || "Not specified"}</strong></div><div><small>INSTALLATION</small><strong>{job.rigInstallation || "Not specified"}</strong></div></section>
                  <div className="report-page-body">
                    <section className="report-index"><div className="report-section-title"><span>00</span><h3>Report Index</h3></div><ol><li><span>01</span><strong>Job and Sampling Summary</strong><em>2</em></li><li><span>02</span><strong>Sample Listing</strong><em>3</em></li><li><span>03</span><strong>Sequence of Events</strong><em>4</em></li><li><span>04</span><strong>Sample Data Sheets</strong><em>5-{reportTotalPages}</em></li></ol></section>
                    <section className="report-section report-summary-section"><div className="report-section-title"><span>01</span><h3>Job and Sampling Summary</h3></div><p className="scope-text">{report.summary}</p><div className="report-summary-grid"><div><small>CLIENT</small><strong>{clientName || "Not specified"}</strong></div><div><small>FIELD</small><strong>{job.fieldArea || "Not specified"}</strong></div><div><small>WELL</small><strong>{job.well || "Not specified"}</strong></div><div><small>JOB DESCRIPTION</small><strong>{job.description || "Not specified"}</strong></div><div><small>SAMPLING TYPE</small><strong>{samplingTypeLabel}</strong></div><div><small>TEST</small><strong>{samplingTypeLabel}</strong></div><div><small>TOTAL SAMPLES</small><strong>{samples.length}</strong></div><div><small>JOB STATUS</small><strong>{report.reportStatus}</strong></div></div></section>
                  </div>
                  <footer className="report-page-footer"><span>VAPS - Sampling and Analysis Report</span><span>{jobId} | Page 2 of {reportTotalPages}</span></footer>
                </section>

                <section className="report-page report-content-page">
                  <header className="report-document-header"><div className="report-brand"><img src="/vaps-logo.png" alt="VAPS" /><small>Sampling and Analysis Report</small></div><div><p>JOB NUMBER</p><strong>{jobId}</strong><span>Revision 00 - {report.reportStatus}</span></div></header>
                  <section className="report-page-meta"><div><small>CLIENT</small><strong>{clientName || "Not specified"}</strong></div><div><small>JOB NO.</small><strong>{jobId}</strong></div><div><small>DATE</small><strong>{reportDate(job.dateReceived)}</strong></div><div><small>FIELD</small><strong>{job.fieldArea || "Not specified"}</strong></div><div><small>WELL</small><strong>{job.well || "Not specified"}</strong></div><div><small>INSTALLATION</small><strong>{job.rigInstallation || "Not specified"}</strong></div></section>
                  <div className="report-page-body"><section className="report-section"><div className="report-section-title"><span>02</span><div><h3>Sample Listing</h3><p>Registered samples associated with this field sampling activity.</p></div></div><div className="table-wrap"><table className="report-data-table"><thead><tr><th>Sample No.</th><th>Sample Date</th><th>Sample Time</th><th>Nature</th><th>Sampling Point</th><th>Bottle / Container</th></tr></thead><tbody>{samples.map((sample) => <tr key={sample.id}><td><strong>{sample.id}</strong></td><td>{reportDate(sample.fieldData.samplingDate)}</td><td>{sample.fieldData.samplingTime || "Not recorded"}</td><td>{sample.fieldData.sampleNature || "Not recorded"}</td><td>{sample.depth || "Not recorded"}</td><td>{containerComplete(sample) ? containerLabel(sample) : "Not recorded"}</td></tr>)}</tbody></table></div><div className="report-table-note"><strong>{samples.length}</strong><span>Total samples recorded</span></div></section></div>
                  <footer className="report-page-footer"><span>VAPS - Sampling and Analysis Report</span><span>{jobId} | Page 3 of {reportTotalPages}</span></footer>
                </section>

                <section className="report-page report-content-page">
                  <header className="report-document-header"><div className="report-brand"><img src="/vaps-logo.png" alt="VAPS" /><small>Sampling and Analysis Report</small></div><div><p>JOB NUMBER</p><strong>{jobId}</strong><span>Revision 00 - {report.reportStatus}</span></div></header>
                  <section className="report-page-meta"><div><small>CLIENT</small><strong>{clientName || "Not specified"}</strong></div><div><small>JOB NO.</small><strong>{jobId}</strong></div><div><small>DATE</small><strong>{reportDate(job.dateReceived)}</strong></div><div><small>FIELD</small><strong>{job.fieldArea || "Not specified"}</strong></div><div><small>WELL</small><strong>{job.well || "Not specified"}</strong></div><div><small>INSTALLATION</small><strong>{job.rigInstallation || "Not specified"}</strong></div></section>
                  <div className="report-page-body"><section className="report-section"><div className="report-section-title"><span>03</span><div><h3>Sequence of Events</h3><p>Chronological record of field, sample-transfer, and workflow activities.</p></div></div><div className="table-wrap"><table className="report-data-table events-report-table"><thead><tr><th>Date</th><th>Time</th><th>Event Description</th><th>Entered By</th></tr></thead><tbody>{sortedEvents.length ? sortedEvents.map((item, index) => <tr key={item.createdAt || `${item.date}-${item.time}-${index}`}><td>{reportDate(item.date || job.dateReceived)}</td><td>{item.time || "Not recorded"}</td><td>{item.description}</td><td>{employeeName(item.createdBy)}</td></tr>) : <tr><td colSpan={4}>No sequence-of-events entries were recorded.</td></tr>}</tbody></table></div></section></div>
                  <section className="report-signatures"><div className="report-signature-block"><small>PREPARED BY</small><strong>{employeeName(report.preparedBy)}</strong><span>Date: {reportDate(report.preparedDate)}</span></div><div className="report-signature-block"><small>APPROVED BY</small><strong>{employeeName(report.approvedBy)}</strong><span>Date: {reportDate(report.approvalDate)}</span></div></section>
                  <footer className="report-page-footer"><span>VAPS - Sampling and Analysis Report</span><span>{jobId} | Page 4 of {reportTotalPages}</span></footer>
                </section>

                {samples.map((sample, index) => <section className="report-page report-content-page sample-data-sheet-page standard-sample-sheet-page" key={`data-sheet-${sample.id}`}>
                  <header className="report-document-header"><div className="report-brand"><img src="/vaps-logo.png" alt="VAPS" /><small>Sampling and Analysis Report</small></div><div><p>JOB NUMBER</p><strong>{jobId}</strong><span>Revision 00 - {report.reportStatus}</span></div></header>
                  <section className="report-page-meta"><div><small>CLIENT</small><strong>{clientName || "Not specified"}</strong></div><div><small>JOB NO.</small><strong>{jobId}</strong></div><div><small>DATE</small><strong>{reportDate(job.dateReceived)}</strong></div><div><small>FIELD</small><strong>{job.fieldArea || "Not specified"}</strong></div><div><small>WELL</small><strong>{job.well || "Not specified"}</strong></div><div><small>INSTALLATION</small><strong>{job.rigInstallation || "Not specified"}</strong></div></section>
                  <div className="report-page-body sample-sheet-body">
                    <section className="report-section"><div className="report-section-title"><span>04</span><div><h3>Standard Sample Data Sheet - {samplingTypeLabel}</h3><p>Controlled field, shipping, transfer, and production record for Sample {sample.id}.</p></div><strong className="sample-sheet-number">SAMPLE {sample.id}</strong></div>
                      <div className="sample-sheet-group"><h4>Identification</h4><div className="sample-sheet-grid four-columns compact-sheet-grid"><div><small>SAMPLE NUMBER</small><strong>{sample.id}</strong></div><div><small>{isGlass(sample) ? "GLASS CONTAINER ID" : "BOTTLE NUMBER"}</small><strong>{containerId(sample) || "Not recorded"}</strong></div><div><small>SAMPLING DATE</small><strong>{reportDate(sample.fieldData.samplingDate)}</strong></div><div><small>SAMPLING TIME</small><strong>{sample.fieldData.samplingTime || "Not recorded"}</strong></div><div><small>SAMPLING POINT / DEPTH</small><strong>{sample.depth || "Not recorded"}</strong></div><div><small>PERFORATIONS</small><strong>{sample.fieldData.perforations || "Not recorded"}</strong></div><div><small>SAMPLE NATURE</small><strong>{sample.fieldData.sampleNature || "Not recorded"}</strong></div><div><small>FLOW PERIOD</small><strong>{sample.fieldData.flowPeriod || "Not recorded"}</strong></div><div><small>FORMATION</small><strong>{sample.fieldData.formation || "Not recorded"}</strong></div><div><small>SAMPLER / SERIAL</small><strong>{sample.sampler ? `${sample.sampler}${sample.samplerSerial ? ` ${sample.samplerSerial}` : ""}` : "N/A"}</strong></div><div><small>DATA STATUS</small><strong>{sample.dataComplete ? "Completed" : "Draft"}</strong></div><div><small>DATA ENTERED BY</small><strong>{employeeName(sample.dataCompletedBy)}</strong></div></div></div>
                      <div className="sample-sheet-group shipping-sheet-group"><h4>Shipping Conditions</h4><div className="sample-sheet-grid four-columns compact-sheet-grid"><div><small>SAMPLE BOTTLE TYPE</small><strong>{sample.bottle || "Not recorded"}</strong></div><div><small>SAMPLE BOTTLE VOLUME</small><strong>{sampleReportValue(sample, "sampleBottleVolume", "sampleBottleVolumeUnit")}</strong></div><div><small>SAMPLE VOLUME</small><strong>{sampleReportValue(sample, "sampleVolume", "sampleVolumeUnit")}</strong></div><div><small>GAS CAP CREATED</small><strong>{sample.fieldData.gasCapCreated || "Not recorded"}</strong></div><div><small>FLUID REMAINING</small><strong>{sampleReportValue(sample, "fluidRemaining", "fluidRemainingUnit")}</strong></div><div><small>FINAL PRESSURE</small><strong>{sampleReportValue(sample, "finalPressure", "finalPressureUnit")}</strong></div><div><small>FINAL TEMPERATURE</small><strong>{sampleReportValue(sample, "finalTemperature", "finalTemperatureUnit")}</strong></div></div></div>
                      <div className="sample-sheet-group"><h4>Matched / Transfer Conditions</h4><div className="sample-sheet-grid four-columns compact-sheet-grid"><div><small>SAMPLE OPENING PRESSURE</small><strong>{sampleReportValue(sample, "initialOpeningPressure", "initialOpeningPressureUnit")}</strong></div><div><small>SAMPLE OPENING TEMPERATURE</small><strong>{sampleReportValue(sample, "initialOpeningTemperature", "initialOpeningTemperatureUnit")}</strong></div><div><small>RECEIVING BOTTLE PRESSURE</small><strong>{sampleReportValue(sample, "receivingBottleOpeningPressure", "receivingBottleOpeningPressureUnit")}</strong></div><div><small>RECEIVING BOTTLE TEMPERATURE</small><strong>{sampleReportValue(sample, "receivingBottleOpeningTemperature", "receivingBottleOpeningTemperatureUnit")}</strong></div><div><small>TRANSFER PRESSURE</small><strong>{sampleReportValue(sample, "transferPressure", "transferPressureUnit")}</strong></div><div><small>TRANSFER TEMPERATURE</small><strong>{sampleReportValue(sample, "transferTemperature", "transferTemperatureUnit")}</strong></div><div><small>TRANSFER DURATION</small><strong>{sample.fieldData.transferDuration || "Not recorded"}</strong></div></div></div>
                      <div className="sample-sheet-group production-sheet-group"><h4>Production Conditions During Sampling</h4><div className="sample-sheet-grid four-columns compact-sheet-grid"><div><small>BHP</small><strong>{sampleReportValue(sample, "bhp", "bhpUnit")}</strong></div><div><small>BHT</small><strong>{sampleReportValue(sample, "bht", "bhtUnit")}</strong></div><div><small>WHP</small><strong>{sampleReportValue(sample, "whp", "whpUnit")}</strong></div><div><small>WHT</small><strong>{sampleReportValue(sample, "wht", "whtUnit")}</strong></div><div><small>CHOKE SIZE</small><strong>{sampleReportValue(sample, "chokeSize")}</strong></div><div><small>STABLE SINCE</small><strong>{sampleReportValue(sample, "stableSince")}</strong></div><div><small>H2S</small><strong>{sampleReportValue(sample, "h2s")}</strong></div><div><small>CO2</small><strong>{sampleReportValue(sample, "co2")}</strong></div><div><small>SEPARATOR PRESSURE</small><strong>{sampleReportValue(sample, "separatorPressure", "separatorPressureUnit")}</strong></div><div><small>SEPARATOR TEMPERATURE</small><strong>{sampleReportValue(sample, "separatorTemperature", "separatorTemperatureUnit")}</strong></div><div><small>GAS RATE</small><strong>{sampleReportValue(sample, "gasRate")}</strong></div><div><small>GAS GRAVITY</small><strong>{sampleReportValue(sample, "gasGravity")}</strong></div><div><small>GAS DIFFERENTIAL PRESSURE</small><strong>{sampleReportValue(sample, "gasDifferentialPressure", "gasDifferentialPressureUnit")}</strong></div><div><small>GAS PRESSURE</small><strong>{sampleReportValue(sample, "gasPressure", "gasPressureUnit")}</strong></div><div><small>GAS TEMPERATURE</small><strong>{sampleReportValue(sample, "gasTemperature", "gasTemperatureUnit")}</strong></div><div><small>FB FACTOR</small><strong>{sampleReportValue(sample, "fbFactor")}</strong></div><div><small>FPV FACTOR</small><strong>{sampleReportValue(sample, "fpvFactor")}</strong></div><div><small>OIL RATE</small><strong>{sampleReportValue(sample, "oilRate")}</strong></div><div><small>CORRECTED BY</small><strong>{sampleReportValue(sample, "correctedBy")}</strong></div><div><small>CONDENSATE GRAVITY 60/60</small><strong>{sampleReportValue(sample, "condensateGravity")}</strong></div><div><small>OIL LINE TEMPERATURE</small><strong>{sampleReportValue(sample, "oilLineTemperature", "oilLineTemperatureUnit")}</strong></div><div><small>WATER RATE</small><strong>{sampleReportValue(sample, "waterRate")}</strong></div><div><small>CGR</small><strong>{sampleReportValue(sample, "cgr")}</strong></div><div><small>WOR</small><strong>{sampleReportValue(sample, "wor")}</strong></div><div><small>BSW</small><strong>{sampleReportValue(sample, "bsw")}</strong></div></div></div>
                      <div className="sample-sheet-remarks"><small>SAMPLE REMARKS</small><p>{sample.notes || "No remarks recorded."}</p></div>
                    </section>
                  </div>
                  <footer className="report-page-footer"><span>VAPS - Sampling and Analysis Report</span><span>{jobId} | Page {5 + index} of {reportTotalPages}</span></footer>
                </section>)}
              </article>}
            </>
          )}
          {stage !== "scope" && renderSequenceEventsPanel()}
            </>
          )}
        </div>
      </main>
      {clientModal && <div className="modal-backdrop" role="presentation"><section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="client-modal-title"><header><div><span className="eyebrow">CLIENT MASTER DATA</span><h2 id="client-modal-title">{clientModal.mode === "add" ? "Add New Client" : "Edit Client"}</h2><p>{clientModal.mode === "add" ? "Create a client for local workflow use." : `Update ${clientForm.shortName || clientForm.name}.`}</p></div><button type="button" onClick={() => setClientModal(null)} aria-label="Close modal">×</button></header><form onSubmit={saveClient}><div className="modal-form-grid"><label><span>Client Name *</span><input ref={clientNameInput} value={clientForm.name} onChange={(e) => { setClientForm((current) => ({ ...current, name: e.target.value })); setClientError(""); }} placeholder="e.g. XYZ Energy LLC" /></label><label><span>Client Short Name / Display Name</span><input value={clientForm.shortName} onChange={(e) => setClientForm((current) => ({ ...current, shortName: e.target.value }))} placeholder="e.g. XYZ Energy" /></label><label><span>Client Code *</span><input disabled={clientModal.mode === "edit"} maxLength={1} value={clientForm.code} onChange={(e) => { setClientForm((current) => ({ ...current, code: e.target.value.toUpperCase() })); setClientError(""); }} placeholder="X" className="code-input" /></label><label><span>Country</span><input value={clientForm.country} onChange={(e) => setClientForm((current) => ({ ...current, country: e.target.value }))} /></label><div className="modal-wide client-logo-upload"><ClientLogo client={clientForm} /><label><span>Client logo <em>Optional</em></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 256 * 1024) { setClientError("Choose a PNG, JPG or WebP logo up to 256 KB."); return; }
  const reader = new FileReader();
  reader.onload = () => { setClientForm((current) => ({ ...current, logo: String(reader.result) })); setClientError(""); };
  reader.onerror = () => setClientError("The logo could not be read. Please try another image.");
  reader.readAsDataURL(file);
}} /><small>PNG, JPG or WebP · up to 256 KB</small></label>{clientForm.logo && <button type="button" className="text-button" onClick={() => setClientForm((current) => ({ ...current, logo: undefined }))}>Reset logo</button>}</div><label className="modal-wide"><span>Notes <em>Optional</em></span><textarea rows={4} value={clientForm.notes} onChange={(e) => setClientForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Add client-specific context…" /></label></div>{clientError && <div className="validation-message" role="alert"><span>!</span>{clientError}</div>}<footer><button type="button" className="text-button" onClick={() => setClientModal(null)}>Cancel</button><button type="submit" className="primary-button">{clientModal.mode === "add" ? "Add Client" : "Save Changes"}</button></footer></form></section></div>}
    </div>
  );
}
