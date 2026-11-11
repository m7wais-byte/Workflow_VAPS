"use client";

import { assetUrl } from "./deployment";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { MyWork, LabSummary, type MyWorkFilter } from './dashboard';
import { CompanyDashboard } from './company-dashboard';
import { jobFlow, type JobFlow } from './job-flow';
import { canOpenJob, jobsInWork, applyJobOperation, noJobAccessMessage } from './job-access';
import { StatusBadge, OverdueBadge, MiniTracker } from './flow-ui';
import { OperationsWorkspace, WeeklyWork, ClarificationReview, LabWorkspace } from './operations-workspace';
import { SamplingReportDocument, exportSamplingReportPdf, downloadSamplingReportPdf, samplingReportInput, type ReportContext } from './sampling-report';
import { applyOperation, isTrashed, trashJob, restoreJob, operationComplete, latest, operationsFor, streamLead, labStatus, labStatuses, type ActivityRecord, isDraft, canSeeDraft, samplingTeam, samplingWorkers, samplingStarted, samplingStatus, latestData, samplingDataLocked, dataReviewRequired, type Actor, type Operations, type Command } from './operations-model';
import { readSavedRouting, effectiveRouting, storedTestRouting, testRoutingKey, type TestRouting, type SavedRouting } from './test-routing';
import { readCustomTests, testCatalogueKey, catalogueIds, type CatalogueTest } from './test-catalogue';
import { TestCatalogueSettings } from './test-settings';
import { OverlapNotice } from './person-picker';
import { readLabTeams, storedLabTeams, labTeamsKey, emptyLabTeams, type LabTeams } from './lab-teams';
import { PvtLab, type LabTestProgress } from "./pvt-lab";
import { labComplete, reconcileLabScope, type LabPlan } from "./lab-work";
import { ClientLogo } from "./client-logo";
import { cylinderCatalog } from "./cylinder-catalog";
import { syncShare, getShare, pauseShare, resumeShare } from "./job-sharing";
import { localDate } from "./local-date";
import { nextJobSequence, nextJobRecordId, assertJobNumberAvailable } from "./job-numbering";
import { workItems, inboxRows, sortItems, jobsNeedingAction, samplingStage, samplingEvents as samplingEventsFor, labEvents as labEventsFor, type WorkItem } from "./work-items";
import { readDemoSetup, saveDemoSetup, type DemoSetup } from "./demo-setup";
import { standardSheetErrors, samplingIssues, samplingSummary, matchedFields, productionFields } from "./sampling-validation";
import { defaultFieldData, samplingPointFor, samplingPointOptions } from "./sample-defaults";
import { containerComplete, containerId, containerLabel, containerNoun, containerTypeName, containerTypes, containerVolumes, isAtmospheric, type ContainerType } from "./sample-container";
import { buildDemoJobs, demoClient, demoLogin, demoConfiguration } from "./demo-data";
import { storeWorkbook } from "./workbook-storage";
import { cylinderStatusKey, cylinderStatuses, readCylinderStatus, selectable, cylinderStateLabel, type CylinderStatusMap, type EffectiveStatus } from "./cylinder-status";
import { CylinderRegister } from "./cylinder-register";
import { teamName } from "./team-name";
import { planRecords, planRecordCount, planErrors, legacyPlan, newPlanRow, rowSummary, isSeparator, CASED_HOLE, type SamplingPlanRow } from "./sampling-plan";
import { coordinator, canWork, type TeamWork } from "./team-workflow";
import { JobWorkflow } from "./job-workflow";
import { jobProgress, trackChanges, type JobProgress, type StageId, type TrackEvent } from "./job-workflow-model";
import { authorizationKey, defaultAuthorization, readAuthorization, allowed, driverMigrationKey, migrateDriverAccess, responsibilitiesKey, defaultResponsibilities, readResponsibilities, roleHolder, responsibilityLabels, storedResponsibilities, unassignedResponsibilities, type Authorization, type Permission, type Responsibilities } from "./authorization";
import { AuthorizationSettings } from "./authorization-settings";
import { initialDirectory, loadDirectory, validateDirectory, directoryKey, type Employee, type Directory } from "./employee-directory";
import { SettingsShell, EmployeeSettings, OptionSettings, CompanySettings, defaultCompany, type Company } from "./settings-pages";
import { BottleSettings } from "./bottle-settings";
import { bottleStorageKey, validateBottle, type Bottle } from "./bottle-inventory";
import { Bell, Inbox, BriefcaseBusiness, ChevronRight, FileText, FlaskConical, Gauge, LayoutDashboard, ListChecks, PackageSearch, Plus, Search, Settings, ShieldCheck, TriangleAlert } from "lucide-react";
import { DateInput, TimeInput, ukDate, ukDateTime } from "./uk-date";
import { DOWNHOLE_TOOL, cylinderTypes, migrateJobNames, migrateCylinder, renameSource } from "./naming";

function ReviewData({ value }: { value: Record<string, unknown> }) {
  return <dl className="review-data-grid">{Object.entries(value).filter(([key]) => key !== "dataUrl").map(([key, entry]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd>{entry && typeof entry === "object" ? <ReviewData value={entry as Record<string, unknown>} /> : typeof entry === "boolean" ? (entry ? "Yes" : "No") : String(entry ?? "") || "Not recorded"}</dd></div>)}</dl>;
}

function CylinderPicker({ sample, onSelect, onField, inventory, status, jobId }: { inventory: Bottle[]; status: (serial: string) => EffectiveStatus; jobId: string; sample: { id: string; bottle: string; bottleSerial: string; bottleCapacity: string; containerType?: ContainerType; containerId?: string; containerVolume?: string }; onSelect: (serial: string) => void; onField: (field: "containerType" | "containerVolume", value: string) => void }) {
  const typeSelect = <label><span>Container Type *</span><select value={sample.containerType || "Bottle"} onChange={(event) => onField("containerType", event.target.value)} aria-label={`Container type for sample ${sample.id}`}>{containerTypes.map((type) => <option key={type} value={type}>{containerTypeName[type]}</option>)}</select></label>;
  if (isAtmospheric(sample)) { const noun = containerNoun(sample), volumes = containerVolumes[sample.containerType as keyof typeof containerVolumes]; return <div className="cylinder-picker">{typeSelect}
    <label><span>{noun} Volume *</span><select value={sample.containerVolume || ""} onChange={(event) => onField("containerVolume", event.target.value)} aria-label={`${noun} volume for sample ${sample.id}`}><option value="">Select volume</option>{volumes.map((volume) => <option key={volume}>{volume}</option>)}</select></label>
    <p className="cylinder-selection-details">{sample.containerId ? `Recorded container ID: ${sample.containerId}. ` : ""}{noun}s are not part of the cylinder inventory, so no cylinder type or serial number is needed.</p>
  </div>; }
  return <BottlePicker sample={sample} onSelect={onSelect} inventory={inventory} typeSelect={typeSelect} status={status} jobId={jobId} />;
}

function BottlePicker({ sample, onSelect, inventory, typeSelect, status, jobId }: { inventory: Bottle[]; status: (serial: string) => EffectiveStatus; jobId: string; sample: { id: string; bottle: string; bottleSerial: string; bottleCapacity: string }; onSelect: (serial: string) => void; typeSelect: ReactNode }) {
  const selected = inventory.find((item) => item.serial === sample.bottleSerial);
  const [pendingType, setPendingType] = useState("");
  const legacy = Boolean(sample.bottleSerial && !selected);
  const bottleType = selected?.type || pendingType;
  const types: readonly string[] = cylinderTypes;
  const ofType = inventory.filter((item) => item.type === bottleType);
  // Only Ready cylinders that no other job holds can be chosen (Sampling → Cylinders).
  const matches = ofType.filter((item) => item.serial === sample.bottleSerial || selectable(status(item.serial), jobId, sample.id));
  const own = selected ? status(selected.serial) : undefined;
  return <div className="cylinder-picker">{typeSelect}
    <label><span>Cylinder Type *</span><select value={bottleType} onChange={(event) => { setPendingType(event.target.value); onSelect(""); }} aria-label={`Cylinder type for sample ${sample.id}`}><option value="">Select cylinder type</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
    <label><span>Serial Number *</span><select disabled={!bottleType} value={selected ? sample.bottleSerial : ""} onChange={(event) => { setPendingType(bottleType); onSelect(event.target.value); }} aria-label={`Serial number for sample ${sample.id}`}><option value="">{bottleType ? "Select serial number" : "Choose cylinder type first"}</option>{matches.map((item) => <option key={item.serial} value={item.serial}>{item.serial}</option>)}</select></label>
    {bottleType && !matches.length && <p className="cylinder-selection-details cyl-none">No Ready {bottleType} cylinder is free ({ofType.length} in inventory). The sampling team checks cylinders in <a href="#sampling">Sampling → Cylinders</a>.</p>}
    {bottleType && matches.length > 0 && !selected && <p className="cylinder-selection-details">{matches.length} Ready {bottleType} cylinder{matches.length === 1 ? "" : "s"} free of {ofType.length}.</p>}
    {selected && <p className="cylinder-selection-details"><strong>Capacity:</strong> {selected.capacity}<br /><strong>Specification:</strong> {selected.specification.replace("Cylinder - ", "")}{own && own.state !== "in-use" && own.state !== "ready" && <><br /><strong className="cyl-warn">Status: {cylinderStateLabel[own.state]}</strong> · choose a Ready cylinder.</>}</p>}
    {legacy && <p className="cylinder-selection-details">Saved cylinder: {sample.bottle} · {sample.bottleSerial} · {sample.bottleCapacity || "Capacity not recorded"}. This serial is not in the current inventory. Choose a type and serial to replace it.</p>}
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
  /** Glass bottle / IATA can volume, e.g. "500 mL". */
  containerVolume?: string;
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
  /** Sampling type of this record when a job has several types; missing on older records (they use the job's type). */
  samplingSource?: string;
  /** Separator Sampling: phase and set of this cylinder. */
  phase?: "Oil" | "Gas";
  set?: number;
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

type SamplingSource = "Open Hole – Field Sampling" | "Open Hole – Lab Transfer" | "Cased Hole (Bottomhole / Downhole Sampling)" | "Wellhead Sampling" | "Separator Sampling" | "Station Sampling" | "Other";

type JobDetails = {
  countryCode: string;
  dateReceived: string;
  fieldArea: string;
  employee: string;
  assignedEngineerId: string;
  assignedDriverId: string;
  requestedSampleCount: string;
  /** Every sampling type of the job with its quantity; the first row is the primary type that drives preparation. */
  samplingPlan: SamplingPlanRow[];
  /** Units for the job-level sampling context values (e.g. separatorPressure → "psi"). */
  contextUnits: Record<string, string>;
  samplingInstructions: string;
  /** Backup / support sampling employees; assignedEngineerId is the accountable lead. */
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
 /** Set while the job is in Trash; every other field is kept unchanged for restoration. */
 trash?: { deletedBy: string; deletedAt: string };
 /** Who moved the job to Trash or restored it, and when. */
 trashLog?: { action: 'deleted' | 'restored'; by: string; at: string }[];
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
  /** All sampling types of the job (samplingSource is the first, primary one). */
  samplingSources?: SamplingSource[];
  samplingPlan?: SamplingPlanRow[];
  contextUnits?: Record<string, string>;
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
  /** Recorded by the system (e.g. job created, sent to Sampling), not typed by a person. */
  auto?: boolean;
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

type WorkspaceView = "inventory" | "pvt-lab" | "dashboard" | "my-work" | "planning" | "overview" | "jobs" | "new-job" | "sampling" | "settings" | "profile";

const workflowStageNames = ["Job Setup", "Sampling Preparation", "Sampling Data", "Report Preview", "Final Report"];
const samplingSources: SamplingSource[] = ["Open Hole – Field Sampling", "Open Hole – Lab Transfer", "Cased Hole (Bottomhole / Downhole Sampling)", "Wellhead Sampling", "Separator Sampling", "Station Sampling", "Other"];
const samplingIsRequired = (source: SamplingSource | "") => Boolean(source && source !== "Open Hole – Lab Transfer" && source !== "Other");
const isCasedHoleSampling = (source: SamplingSource | "") => source === "Cased Hole (Bottomhole / Downhole Sampling)";
const isSpmcFieldSampling = (source: SamplingSource | "") => source === "Open Hole – Field Sampling";
const isMpsrLabTransfer = (source: SamplingSource | "") => source === "Open Hole – Lab Transfer";
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
  requestedSampleCount: "", samplingPlan: [], contextUnits: {}, samplingInstructions: "", samplingTeamIds: [], requiredTests: [], otherTests: "", sampleCountNotes: "",
  countryCode: "OM", dateReceived: localDate(), fieldArea: "", employee: "", assignedEngineerId: "", assignedDriverId: "", clientFocalPoint: "", clientFocalPointContact: "", clientFocalPointEmail: "", dueDate: "", description: "",
  well: "", wellMode: "single", wells: [""], rigInstallation: "", plannedDepth: "", formation: "", perforationInterval: "", wellheadLocation: "", chokeSize: "", whp: "", wht: "",
  facility: "", separatorId: "", separatorStage: "", samplingPoint: "", separatorPressure: "", separatorTemperature: "", relatedWell: "", locationNotes: "", otherDescription: "", otherSamplingType: "",
  oilRate: "", gasRate: "", waterRate: "",
});

const samplerTypes = [DOWNHOLE_TOOL];
// Units the sampling engineer can choose for each measurement on the data sheet. Values are stored as entered with their unit.
const pressureUnits = ["psi", "psia", "psig", "bar", "barg", "kPa", "MPa"];
const temperatureUnits = ["°C", "°F", "K"];
const volumeUnits = ["cc", "mL", "L"];
const depthUnits = ["m", "ft", "m MD", "m TVD", "ft MD", "ft TVD"];
const durationUnits = ["min", "h"];
const flowPeriodUnits = ["h", "min"];
const chokeUnits = ["/64 in", "in", "mm", "% open"];
const concentrationUnits = ["ppm", "mol %", "% vol", "mg/m³"];
const gasRateUnits = ["MMscf/d", "Mscf/d", "scf/d", "Sm³/d", "m³/d", "MSm³/d"];
const liquidRateUnits = ["STB/d", "bbl/d", "m³/d", "Sm³/d", "L/min"];
const gasGravityUnits = ["air = 1"];
const liquidGravityUnits = ["SG 60/60 °F", "°API", "kg/m³"];
/** Sample nature codes (final list to be provided by the sampling team). */
const sampleNatureOptions: [string, string][] = [["BHS", "Bottomhole (BHS)"], ["OHS", "Open-hole field sampling (OHS)"], ["OHT", "Open-hole lab transfer (OHT)"], ["WHS", "Wellhead (WHS)"], ["SEP", "Separator (SEP)"], ["STN", "Station (STN)"], ["OIL", "Oil"], ["GAS", "Gas"], ["WATER", "Water"], ["CONDENSATE", "Condensate"]];
const gorUnits = ["scf/STB", "Sm³/Sm³", "m³/m³", "Mscf/STB"];
const cgrUnits = ["STB/MMscf", "bbl/MMscf", "Sm³/MSm³", "m³/m³"];
const worUnits = ["bbl/bbl", "STB/STB", "m³/m³"];
const bswUnits = ["% vol"];
const navItems = ["Dashboard", "My work", "Jobs", "Sampling", "Laboratory", "Inventory", "Settings"];
const navIcons = [LayoutDashboard, Inbox, BriefcaseBusiness, FlaskConical, ListChecks, PackageSearch, Settings];


const emptySamples = (): Sample[] => ["1.01", "1.02", "1.03"].map((id) => ({
  id, sampler: DOWNHOLE_TOOL, bottle: "PDS", samplerSerial: "", bottleSerial: "", bottleCapacity: "", calibrationStatus: "Not Checked", pressureTestStatus: "Not Checked", equipmentCondition: "Not Checked", preparedBy: "", preparedAt: "", preparationRemarks: "", fieldData: defaultFieldData(), dataComplete: false, dataCompletedBy: "", dataCompletedAt: "", pressure: "", temperature: "", depth: "", notes: "",
}));

export default function Home() {
  const [directory, setDirectory] = useState(initialDirectory);
  const demoEmployees = directory.employees;
  const [directoryError, setDirectoryError] = useState('');
  const [company, setCompany] = useState<Company>(defaultCompany);
  const [editorRoute,setEditorRoute]=useState<string[]>([]);
  const [operationTab,setOperationTab]=useState('overview');
  const [workspaceView, setWorkspaceViewState] = useState<"workflow" | WorkspaceView>("my-work");
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
    const route = (event?: HashChangeEvent) => { if(event && window.confirmSettingsLeave && !window.confirmSettingsLeave()){history.replaceState(null,"",event.oldURL);return;} const parts=location.hash.slice(1).split('/'); if(parts[0]==='settings') { setWorkspaceViewState('settings'); setSettingsPage(parts[1]||''); } else {setWorkspaceViewState((parts[0] || 'my-work') as WorkspaceView);if(parts[0]==='new-job'&&parts[1])setEditorRoute(parts.slice(1));if(parts[0]==='workflow'){if(parts[1])setWorkflowJobId(decodeURIComponent(parts[1]));setOperationTab(parts[2]?.split('?')[0]||'overview');setLegacyView(false);}}; };
    route(); window.addEventListener('hashchange',route); return ()=>window.removeEventListener('hashchange',route);
  }, []);
  /** The sampling step an employee should land on for this job's current status. */
  function samplingStageFor(item: JobRecord): Stage { return samplingStage(item, responsibilities); }
  function openOperation(item:JobRecord,tab='overview') {location.assign('#workflow/'+encodeURIComponent(item.id)+'/'+tab);}
  function runOperation(id:string,command:Command|Command[]) {
    if(!currentEmployee)throw Error('Select an active trial profile.');
    const stored:JobRecord[]=JSON.parse(localStorage.getItem(jobsStorageKey)||'[]');
    const target=stored.find(j=>j.id===id);if(!target)throw Error('Job no longer exists.');
    const shown=jobs.find(j=>j.id===id);if(target.operations?.revision!==shown?.operations?.revision)throw Error('This job changed in another view. Refresh before saving; your edits have been retained.');
    // A batch (e.g. one Assign-to for several activities) applies each command in order and saves once; any refusal saves nothing.
    const actor=freshActor();const updated=(Array.isArray(command)?command:[command]).reduce((job,c)=>applyJobOperation(job,c,actor),target);
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
  const [savedResponsibilities, setResponsibilities] = useState<Responsibilities>(() => ({ ...defaultResponsibilities }));
  const [responsibilitiesError, setResponsibilitiesError] = useState("");
  const [savedTestRouting, setTestRouting] = useState<TestRouting>(() => effectiveRouting({}));
  const [savedRoutingRaw, setSavedRoutingRaw] = useState<SavedRouting>({});
  const [customTests, setCustomTests] = useState<CatalogueTest[]>([]);
  const [testRoutingError, setTestRoutingError] = useState("");
  const [savedLabTeams, setLabTeams] = useState<LabTeams>(emptyLabTeams);
  const [labTeamsError, setLabTeamsError] = useState("");
  // The labelled demo setup replaces teams, routing and listed duties only while it is on. Saved Settings are never changed by it.
  const [demoSetup, setDemoSetupState] = useState<DemoSetup | null>(null);
  const demoActive = !!demoSetup?.enabled;
  const responsibilities: Responsibilities = demoActive ? Object.fromEntries(Object.entries(savedResponsibilities).map(([key, value]) => [key, typeof demoSetup!.roles[key] === "string" ? demoSetup!.roles[key] : value])) as Responsibilities : savedResponsibilities;
  const testRouting: TestRouting = demoActive ? { ...savedTestRouting, ...demoSetup!.routing } : savedTestRouting;
  const labTeams: LabTeams = demoActive ? demoSetup!.teams : savedLabTeams;
  const hasPermission = (permission: Permission) => !directoryError && !!demoEmployees.find(e=>e.id===currentEmployee?.id && e.active) && !authorizationError && allowed(authorization, currentEmployee?.id, permission);
  const assignedToSampling = () => { const j = storedJobs.find((item) => item.id === jobId); return !!j && !!currentEmployee && samplingWorkers(j).includes(currentEmployee.id); };
  const canView = (view: string) => {
    if (view === "settings") return ["settings", "company", "employees", "authorization", "tests"].some(p=>hasPermission(p as Permission));
    // Sampling team members assigned to this job reach its sampling sheets through the assignment, whatever their department.
    if (view === "new-job") return createdJobId ? hasPermission("jobDetails") && (stage === "job" || hasPermission("sampling") || assignedToSampling()) : hasPermission("createJob");
    // Company-wide figures need their own permission; job details alone grants personal views only.
    if (view === "overview") return hasPermission("companyOverview") && hasPermission("jobDetails");
    const permission = ({ jobs: "jobDetails", workflow: "jobDetails", planning: "jobDetails", sampling: "sampling", "pvt-lab": "analysis", inventory: "inventory" } as Record<string, Permission>)[view];
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
      try { const custom = readCustomTests(window.localStorage.getItem(testCatalogueKey)); const raw = readSavedRouting(window.localStorage.getItem(testRoutingKey), catalogueIds(custom)); setCustomTests(custom); setSavedRoutingRaw(raw); setTestRouting(effectiveRouting(raw)); setTestRoutingError(""); }
      catch { setTestRouting({}); setTestRoutingError("Saved test catalogue or routing could not be loaded. Laboratory scope release is blocked until it is restored."); }
      setDemoSetupState(readDemoSetup());
      try { setLabTeams(readLabTeams(window.localStorage.getItem(labTeamsKey), loadDirectory().employees.map(person => person.id))); setLabTeamsError(""); }
      catch { setLabTeams(emptyLabTeams()); setLabTeamsError("Saved laboratory teams could not be loaded. Test assignment is blocked until they are saved again."); }
    };
    load();
    const onStorage = (event: StorageEvent) => { if (event.key === authorizationKey || event.key === responsibilitiesKey || event.key === testRoutingKey || event.key === testCatalogueKey || event.key === labTeamsKey || event.key === "vaps-demo-setup-v1" || event.key === null) load(); };
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
  const [cylinderRecords, setCylinderRecords] = useState<CylinderStatusMap>({});
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCylinderRecords(readCylinderStatus()); }, []);
  function saveCylinderRecords(next: CylinderStatusMap, message: string) { window.localStorage.setItem(cylinderStatusKey, JSON.stringify(next)); setCylinderRecords(next); setNotice(message); recordActivity(message, "Cylinders"); }
  useEffect(() => {
    try {
      const rawSaved = JSON.parse(window.localStorage.getItem(bottleStorageKey) || "[]");
      if (!Array.isArray(rawSaved)) throw new Error("Invalid cylinder inventory");
      // Custom cylinders saved with the neutral Type A–E names are converted back to the original type names.
      const saved = rawSaved.map((bottle) => bottle && typeof bottle.type === "string" && typeof bottle.specification === "string" ? migrateCylinder(bottle) : bottle);
      if (JSON.stringify(saved) !== JSON.stringify(rawSaved)) window.localStorage.setItem(bottleStorageKey, JSON.stringify(saved));
      const loaded: Bottle[] = [];
      for (const bottle of saved) {
        if (!bottle || ![bottle.type, bottle.serial, bottle.capacity, bottle.specification].every((value) => typeof value === "string")) throw new Error("Invalid cylinder record");
        if (cylinderCatalog.some((item) => item.serial.toLowerCase() === bottle.serial.trim().toLowerCase())) continue;
        if (validateBottle(bottle, loaded)) throw new Error("Invalid cylinder record");
        loaded.push(bottle);
      }
      // Saved records live in browser storage, so they are loaded after mount to keep server and client HTML identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomBottles(loaded);
    } catch { setBottleLoadError("Saved cylinder inventory could not be loaded. Adding cylinders is disabled to protect the saved records."); }
  }, []);
  const [storedJobs, setJobs] = useState<JobRecord[]>(defaultJobs);
  /** Cylinder status: In use / Returned come from the jobs, the rest from the register. */
  const cylStatus = cylinderStatuses(storedJobs, cylinderRecords);
  // Jobs in Trash stay stored (for restoration and ID numbering) but leave every list, queue and count.
  const jobs = storedJobs.filter((item) => !isTrashed(item));
  const [seenSampling, setSeenSampling] = useState<Record<string, string[]>>({});
  useEffect(() => { try { const raw = localStorage.getItem(samplingSeenKey); // Per-browser marker of which shared events this employee has opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (raw) setSeenSampling(JSON.parse(raw)); } catch { /* indicators simply show again */ } }, []);
  const [activities, setActivities] = useState<Activity[]>(defaultActivities);
  const [trackedSamples, setTrackedSamples] = useState<string[]>([]);
  const [jobsRegisterFilter, setJobsRegisterFilter] = useState<"mine" | "myjobs" | "active" | "drafts" | "completed" | "all" | "trash">("active");
  const [myWorkFilter, setMyWorkFilterState] = useState<MyWorkFilter>("now");
  const [returnTo, setReturnToState] = useState("my-work");
  useEffect(() => { try { const f = sessionStorage.getItem("vaps-mywork-filter"); // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f) setMyWorkFilterState(f as MyWorkFilter); const r = sessionStorage.getItem("vaps-return-to"); if (r) setReturnToState(r === "dashboard" ? "my-work" : r); } catch { /* defaults apply */ } }, []);
  const setMyWorkFilter = (f: MyWorkFilter) => { setMyWorkFilterState(f); try { sessionStorage.setItem("vaps-mywork-filter", f); } catch { /* not critical */ } };
  /** Where the job workspace's back link returns to: the view the employee opened the job from. */
  const setReturnTo = (view: string) => { setReturnToState(view); try { sessionStorage.setItem("vaps-return-to", view); } catch { /* not critical */ } };
  const [jobsRegisterStage, setJobsRegisterStage] = useState("");
  const [jobsRegisterSearch, setJobsRegisterSearch] = useState("");
  const [labJobId, setLabJobId] = useState("");
  const [samplingTab, setSamplingTab] = useState<"jobs" | "reports" | "cylinders">("jobs");
  const [selectedJobDetailsId, setSelectedJobDetailsId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; error?: string; busy?: boolean } | null>(null);
  const [clients, setClients] = useState<Client[]>(defaultClients);
  const [client, setClient] = useState("");
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
    try {
      const employeeId = window.sessionStorage.getItem(sessionStorageKey);
      setCurrentEmployee(loadDirectory().employees.find((employee) => employee.id === employeeId && employee.active) ?? null);
        const storedJobs = window.localStorage.getItem(jobsStorageKey);
        const storedActivities = window.localStorage.getItem(activityStorageKey);
        if (storedJobs) {
          const rawJobs = JSON.parse(storedJobs) as JobRecord[];
          // Jobs saved with the old tool and cylinder names are converted once and saved back.
          const parsedJobs = rawJobs.map(migrateJobNames);
          if (parsedJobs.some((item, index) => item !== rawJobs[index])) window.localStorage.setItem(jobsStorageKey, JSON.stringify(parsedJobs));
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
        // No client is pre-selected: the coordinator picks one, and the job ID appears only then.
        if (client && !parsed.some((item) => item.code === client && item.active)) setClient("");
      }
    } catch {
      setNotice("Saved clients could not be loaded. Existing storage was preserved.");
    }
  }, []);

  const selectedClient = clients.find((item) => item.code === client);
  const clientName = selectedClient?.shortName || selectedClient?.name || "";
  const clientJobPrefix = client.trim().toUpperCase().slice(0, 1);
  const nextSequence = nextJobSequence(globalCounter, storedJobs, trackingYearShort);
  const generatedJobId = `${job.countryCode}-${clientJobPrefix}-${trackingYearShort}-${String(nextSequence).padStart(3, "0")}`;
  const jobId = createdJobId || nextJobRecordId(generatedJobId, storedJobs);
  const displayJobId = storedJobs.find(item => item.id === createdJobId)?.jobNumber || generatedJobId;
  const samplingTypeLabel = samplingType === "Other" && job.otherSamplingType.trim() ? `Other — ${job.otherSamplingType.trim()}` : samplingType;
  const activeClients = clients.filter((item) => item.active);
  /** Display name of a sampling type, including the free text for "Other". */
  const sourceLabel = (source: string) => source === "Other" && job.otherSamplingType.trim() ? `Other — ${job.otherSamplingType.trim()}` : source;
  /** Adds a system entry (e.g. job created, sent to Sampling) to the Sequence of Events, kept in date and time order. */
  const withAutoEvent = (list: SequenceEvent[], description: string): SequenceEvent[] => {
    const at = new Date();
    const entry: SequenceEvent = { date: localDate(at), time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`, description, createdBy: currentEmployee?.id, createdAt: at.toISOString(), auto: true };
    return [...list, entry].sort((left, right) => `${left.date || ""}T${left.time}`.localeCompare(`${right.date || ""}T${right.time}`));
  };
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
  /** Letterhead, client master and job titles used by the Sampling and Analysis Report. */
  const reportContext: ReportContext = { company, clients, employeeName, positionName: (id) => { const e = demoEmployees.find((x) => x.id === id); return (e && directory.positions.find((p) => p.id === e.positionId)?.name) || ""; } };
  const formatDateTime = (value?: string) => ukDateTime(value) || "Not recorded";
  const currentJob = jobs.find((item) => item.id === jobId);
  /** The configured sampling approver for actions taken now. Recorded approvals keep their own approver. */
  const samplingApprover = roleHolder(responsibilities, "samplingApproval", demoEmployees);
  const opsActor: Actor | null = currentEmployee ? { id: currentEmployee.id, employees: demoEmployees, policy: authorization, roles: responsibilities, routing: testRoutingError ? null : testRouting, teams: labTeamsError ? null : labTeams, jobs, departments: directory.departments } : null;
  // Drafts are shown only to job creators, their author and the administrator, in every list and direct link.
  const visibleJobs = opsActor ? jobs.filter((item) => canSeeDraft(item, opsActor)) : [];
  const progressById = new Map<string, JobProgress>(jobs.map((item) => [item.id, jobProgress(item)]));
  // One workflow status for the Dashboard, job page, My work and client view (job-flow.ts).
  const flowById = new Map<string, JobFlow>(jobs.map((item) => [item.id, jobFlow(item, responsibilities, demoEmployees)]));
  const flowOf = (item: JobRecord) => flowById.get(item.id) || jobFlow(item, responsibilities, demoEmployees);
  const dashboardJobs = visibleJobs.filter((item) => !isDraft(item)).map((item) => ({ job: item, flow: flowOf(item) }));
  const prog = (item: JobRecord) => progressById.get(item.id) || jobProgress(item);
  const isClosed = (item: JobRecord) => prog(item).closed;
  const myActivities = currentEmployee ? activities.filter((item) => item.employeeId === currentEmployee.id) : [];
  const today = localDate();
  // Sampling queue: assigned work first; drafts never appear.
  const samplingJobsAll = visibleJobs.filter((item) => item.samplingSource && !isDraft(item) && (item.operations?.dispatchedAt || item.operations || item.samples?.length));
  // Sampling queue: the same work items as My work, limited to sampling responsibilities.
  const samplingWorkIds = new Set<string>();
  const samplingOverview = [...samplingJobsAll].sort((a, b) => (b.lastUpdatedAt || "").localeCompare(a.lastUpdatedAt || ""));
  /** In-app indicator events for the signed-in employee, keyed by the shared record so each event is flagged once. */
  /** In-app indicator events, keyed by the shared record so each event is flagged once (shared with the Dashboard). */
  const samplingEvents = (item: JobRecord): string[] => currentEmployee ? samplingEventsFor(item, currentEmployee.id, samplingApprover) : [];
  const isNewItem = (item: WorkItem) => item.events.some((key) => !(seenSampling[currentEmployee?.id || ""] || []).includes(key));
  // One shared work-item model: My work, Jobs counts, Sampling and Laboratory queues and the weekly plan all read this.
  const dashboardWork = opsActor ? workItems(visibleJobs, opsActor, today) : { actions: [] as WorkItem[], waiting: [], blocked: [], upcoming: [], alerts: [] };
  const inbox = opsActor ? inboxRows(dashboardWork, visibleJobs, opsActor, today, { isNew: isNewItem, isClosed, stage: (item) => isDraft(item) ? "Job creation (draft)" : prog(item).current?.label || "Closed" }) : [];
  const seenKeys = new Set(seenSampling[currentEmployee?.id || ""] || []);
  const unseenAlerts = dashboardWork.alerts.filter((a) => !seenKeys.has(a.key));
  const blockedAssign = (i: WorkItem) => i.key.startsWith("assign:") && !!i.stream && !labTeams[i.stream]?.length;
  const nowItems = sortItems(dashboardWork.actions.filter((i) => !blockedAssign(i)), isNewItem);
  /** Job access: responsibilities, assignments and supervisory permissions (job-access.ts). Hiding links alone is not relied on. */
  const workJobIds = jobsInWork(dashboardWork);
  const canOpen = (item: JobRecord) => !!opsActor && canOpenJob(item, opsActor, workJobIds);
  const actionJobIds = jobsNeedingAction({ actions: nowItems });
  const myJobIds = new Set(inbox.map((r) => r.jobId));
  for (const i of dashboardWork.actions) if (i.area === "Sampling") samplingWorkIds.add(i.jobId);
  for (const w of dashboardWork.waiting) if (/^w-(sampling|support|returned|dispatch):/.test(w.key)) samplingWorkIds.add(w.jobId);
  for (const u of dashboardWork.upcoming) if (u.area === "Sampling") samplingWorkIds.add(u.jobId);
  const mySamplingWork = samplingJobsAll.filter((item) => samplingWorkIds.has(item.id));
  const canCompany = hasPermission("companyOverview");
  const unseenEvents = (item: JobRecord) => samplingEvents(item).filter((key) => !(seenSampling[currentEmployee?.id || ""] || []).includes(key));
  /** Laboratory indicator events for the signed-in employee: new assignment, returned work and items awaiting their review. */
  const labEvents = ({ a }: { job: JobRecord; a: ActivityRecord }): string[] => currentEmployee ? labEventsFor(a, currentEmployee.id, roleHolder(responsibilities, streamLead(a.stream), demoEmployees), roleHolder(responsibilities, "qcReviewer", demoEmployees)) : [];
  const labItemsVisible = visibleJobs.filter((item) => !isDraft(item)).flatMap((job) => operationsFor(job).activities.filter((a) => a.required).map((a) => ({ job, a })));
  const samplingActionLabel = (item: JobRecord) => ({ draft: "Open job", preparation: "Start preparation", data: "Continue sampling data", "data-review": "Review sampling data", returned: "Correct returned work", "report-generation": "Sampling report", "report-review": "Review report", "report-approved": "Open job" } as Record<string, string>)[samplingStatus(item, responsibilities).key];
  const reportsWorkspaceJobs = visibleJobs.filter((item) => (hasPermission("companyOverview") || samplingWorkIds.has(item.id)) && (item.operations?.samplingReports.length || item.report?.preparedBy || item.report?.summary));
  const registerStage = (item: JobRecord) => isDraft(item) ? "Job creation (draft)" : flowOf(item).current;
  const registerStages = [...new Set(visibleJobs.map(registerStage))];
  const trashedJobs = opsActor && hasPermission("deleteJobs") ? storedJobs.filter((item) => isTrashed(item) && canSeeDraft(item, opsActor)).sort((a, b) => (b.trash?.deletedAt || "").localeCompare(a.trash?.deletedAt || "")) : [];
  // Company-wide lists need the company overview permission; everyone else sees jobs where they hold a responsibility (and drafts, for job creators).
  const registerBase = canCompany ? visibleJobs : visibleJobs.filter((item) => myJobIds.has(item.id) || (isDraft(item) && hasPermission("createJob")));
  const registerCounts = { trash: trashedJobs.length, mine: registerBase.filter((item) => actionJobIds.has(item.id)).length, myjobs: registerBase.filter((item) => myJobIds.has(item.id)).length, active: registerBase.filter((item) => !isClosed(item) && !isDraft(item)).length, drafts: registerBase.filter(isDraft).length, completed: registerBase.filter(isClosed).length, all: registerBase.length };
  const registerFilter = !canCompany && ["active", "completed", "all"].includes(jobsRegisterFilter) ? "myjobs" : jobsRegisterFilter;
  const filteredJobsRegister = registerBase.filter((item) => {
    const matchesFilter = registerFilter === "all" || (registerFilter === "mine" && actionJobIds.has(item.id)) || (registerFilter === "myjobs" && myJobIds.has(item.id)) || (registerFilter === "active" && !isClosed(item) && !isDraft(item)) || (registerFilter === "drafts" && isDraft(item)) || (registerFilter === "completed" && isClosed(item));
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
  const dashboardDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const isOverdue = (item: JobRecord) => !isClosed(item) && Boolean(item.dueDate && item.dueDate < today);

  function persistJobs(next: JobRecord[]) {
    const refs=(j:JobRecord)=>[j.responsibleId,j.jobResponsibleId,j.assignedEngineerId,j.assignedDriverId,...j.stages.map(s=>s.assignedTo),...Object.values(j.teamWork||{}).map(t=>t.owner),...Object.values(j.labPlan?.assignees||{}),j.report?.preparedBy];
    for(const item of next) {if(item.trash)continue;const old=storedJobs.find(j=>j.id===item.id);const previous=old?refs(old):[];if(refs(item).some(id=>id&&!previous.includes(id)&&!demoEmployees.some(e=>e.id===id&&e.active))) throw Error('New assignments require an active employee.');}

    const tracked = next.map(item => {
      if (item.trash) return item;
      const reconciled = item.operations ? item : reconcileLabScope(item);
      const task = reconciled.teamWork?.analysis;
      if (task?.completedAt && !labComplete(reconciled)) {
        reconciled.teamWork = {...reconciled.teamWork, analysis: {...task, completedAt: undefined}};
      }
      return trackChanges(reconciled, storedJobs.find(previous => previous.id === item.id));
    });
    // A caller that only sees active jobs never drops the ones in Trash.
    const all = [...tracked, ...storedJobs.filter((item) => item.trash && !next.some((other) => other.id === item.id))];
    try { window.localStorage.setItem(jobsStorageKey, JSON.stringify(all)); } catch { setNotice("The job could not be saved. Browser storage may be full. Your entered information is still available; retry after freeing space."); throw Error("Job save failed. No stored records were changed."); }
    setJobs(all);
    for (const item of tracked) if (!item.trash) { void syncShare(item).catch(() => setNotice("Job saved on this device, but its shared summary could not be updated. Open Workflow and choose Update shared summary to retry.")); }
  }

  function resumeJob(item: JobRecord, navigate=true) {
    if(navigate)setEditorRoute([]);
    if (!hasPermission("jobDetails")) { setNotice("You do not have access to job details."); return; }
    if (!canOpen(item)) { setNotice(noJobAccessMessage); return; }
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
      contextUnits: item.contextUnits || {},
      gasRate: item.gasRate || "",
      waterRate: item.waterRate || "",
    });
    const storedSource = item.samplingSource as string | undefined;
    const normalizedSource: SamplingSource | "" = storedSource === "Bottomhole / Downhole Sampling"
      ? item.holeType === "Open Hole" ? "Open Hole – Lab Transfer" : "Cased Hole (Bottomhole / Downhole Sampling)"
      : (renameSource(storedSource) as SamplingSource | undefined) || "";
    setSamplingRequired(item.samplingRequired ?? (normalizedSource ? samplingIsRequired(normalizedSource) : null));
    setSamplingType(normalizedSource);
    setJob((current) => ({ ...current, samplingPlan: legacyPlan({ ...item, samplingSource: normalizedSource || undefined }) }));
    setHoleType(item.holeType || "");
    setScopeAttachment(item.scopeOfWorkAttachment || null);
    const loadedSamples = item.samples || [];
    setSamples(isSpmcFieldSampling(normalizedSource) && loadedSamples.length ? loadedSamples.map((sample) => ({ ...sample, sampler: DOWNHOLE_TOOL, samplerSerial: loadedSamples[0].samplerSerial, calibrationStatus: loadedSamples[0].calibrationStatus, pressureTestStatus: loadedSamples[0].pressureTestStatus, equipmentCondition: loadedSamples[0].equipmentCondition })) : loadedSamples);
    setEvents(item.events || []);
    setCoordinationTasks(createCoordinationTasks(normalizedSource, item.coordinationTasks || []));
    setCoordinationDetails({ ...emptyCoordinationDetails(), ...(item.coordinationDetails || {}) });
    // Only completed reports keep an approver: the recorded signature. A pending approver is resolved from Settings at the time of action.
    setReport(item.report ? { ...item.report, approvedBy: item.report.reportStatus === "Completed" ? item.report.approvedBy : "" } : { summary: "", preparedBy: "", preparedDate: "", approvedBy: "", approvalDate: "", reportStatus: "Draft" });
    const nextStage: Stage = item.currentStage === "Sampling Decision" ? (normalizedSource ? "type" : "job") : item.currentStage === "Sampling Preparation" ? "type" : item.currentStage === "Sampling Data" ? "bottomhole" : item.currentStage === "Report Preview" ? "report" : item.currentStage === "Final Report" || item.status === "Completed" || item.currentStage === "Scope of Work" ? "scope" : "job";
    setStage(nextStage);
    if(navigate)setWorkspaceView("new-job");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // Opening a #new-job/<id> link restores that draft into the editor state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(!authReady||!currentEmployee)return;if(workspaceView==='new-job'&&editorRoute[0]&&createdJobId!==decodeURIComponent(editorRoute[0])){const saved=visibleJobs.find(j=>j.id===decodeURIComponent(editorRoute[0])&&canOpen(j));if(!saved){setNotice('Job not found or not available to your profile.');setEditorRoute([]);location.replace('#jobs');}else{resumeJob(saved,false);const [target,query]=(editorRoute[1]||'').split('?');if(['job','type','bottomhole','scope','report'].includes(target))setStage(target as Stage);const sample=new URLSearchParams(query||'').get('sample');if(sample)setExpanded(sample);}}},[authReady,currentEmployee?.id,workspaceView,editorRoute,jobs]);
  useEffect(()=>{if(workspaceView==='workflow'&&workflowJobId&&location.hash==='#workflow')history.replaceState(null,'','#workflow/'+encodeURIComponent(workflowJobId)+'/overview');if(workspaceView==='new-job'&&createdJobId&&currentJob)history.replaceState(null,'','#new-job/'+encodeURIComponent(createdJobId)+'/'+stage);},[workspaceView,workflowJobId,createdJobId,stage,currentJob]);


  /** Open the work area for a job's stage (defaults to its current stage). */
  function openStage(item: JobRecord, stageId?: StageId | "closed") {
    if(item.operations){openOperation(item,stageId==="lab"?"laboratory":stageId==="delivery"?"scope":stageId==="sampling"?"sampling":stageId==="setup"?"overview":stageId==="planning"?"scope":stageId==="sampling-report"?"sampling-report":stageId==="reporting"?"reporting":"overview");return;}
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

  /** Moves a job to Trash. Permission is checked against settings read now, inside trashJob, not only by hiding the button. */
  async function moveJobToTrash(id: string) {
    const stored: JobRecord[] = JSON.parse(window.localStorage.getItem(jobsStorageKey) || "[]");
    const target = stored.find((item) => item.id === id);
    if (!target) throw Error("Job no longer exists.");
    const now = new Date().toISOString();
    const updated = trashJob(target, freshActor(), now);
    // The client link is withdrawn before the job leaves the lists; it keeps its address for restoration.
    if (getShare(id)?.enabled) await pauseShare(id);
    persistJobs(stored.map((item) => item.id === id ? updated : item));
    recordActivity("Job moved to Trash", id, now);
  }
  function restoreJobFromTrash(id: string) {
    const stored: JobRecord[] = JSON.parse(window.localStorage.getItem(jobsStorageKey) || "[]");
    const target = stored.find((item) => item.id === id);
    if (!target) throw Error("Job no longer exists.");
    const now = new Date().toISOString();
    assertJobNumberAvailable(target, stored);
    const restored = restoreJob(target, freshActor(), now);
    persistJobs(stored.map((item) => item.id === id ? restored : item));
    recordActivity("Job restored from Trash", id, now);
    if (getShare(id)?.paused) void resumeShare(restored).catch(() => setNotice("Job restored, but its shared summary could not be republished. Open Workflow and choose Update shared summary to retry."));
  }
  function recordActivity(action: string, targetJobId = jobId, timestamp = new Date().toISOString()) {
    if (!currentEmployee) return;
    const next = [{ id: newActivityId(), employeeId: currentEmployee.id, action, jobId: targetJobId, timestamp }, ...activities].slice(0, 80);
    persistActivities(next);
  }

  /** Saves the editor state. With send, the job is dispatched to Sampling against freshly read settings; a refusal throws. */
  function updateCurrentJob(nextStage: string, nextAction: string, stageUpdates: Record<string, WorkflowStatus> = {}, action?: string, recordUpdates: Partial<JobRecord> = {}, send = false): boolean {
    if (!currentEmployee) return false;
    if ((!currentJob || isDraft(currentJob)) && !hasPermission("createJob")) { setNotice("You are not authorized to create jobs."); return false; }
    // Same job-access rule as the job route and workflow commands, checked against settings read now.
    if (currentJob && !canOpenJob(currentJob, { ...freshActor(), jobs })) { setNotice(noJobAccessMessage); return false; }
    if (currentJob && (!hasPermission("jobDetails") || (stage !== "job" && !hasPermission("sampling") && !assignedToSampling()))) { setNotice("You do not have access to update this work area."); return false; }
    if(currentJob && !coordinator(currentEmployee.id) && samplingTeam(currentJob).includes(currentEmployee.id) && !samplingWorkers(currentJob).includes(currentEmployee.id)){setNotice("You are a backup on this job with view-only access. Ask the job coordinator to give you work access in Job access.");return false; }
    if(currentJob && stage !== "job" && !coordinator(currentEmployee.id) && !samplingStarted(currentJob)){setNotice("Start the job first: open the job briefing and press Start job.");return false; }
    if(currentJob && !coordinator(currentEmployee.id) && !samplingWorkers(currentJob).includes(currentEmployee.id) && !canWork(currentJob,"sampling",currentEmployee.id)){setNotice("Only the accepted sampling owner or a job coordinator can update this job workspace.");return false; }
    if(currentJob && stage !== "job" && samplingDataLocked(currentJob)){setNotice(latestData(currentJob)?.status==="Submitted"?"The sampling data is submitted for review and is read-only until it is returned.":"The sampling data is approved and read-only. To correct it, reopen it with a reason in Sampling review & report.");return false; }
    if(currentJob?.operations?.samplingReports.some(r=>["Checking","Awaiting Approval","Approved"].includes(r.status)) && !["Draft","Changes Requested"].includes(currentJob.operations.samplingReports.at(-1)!.status)){setNotice("Submitted sampling data is locked. Request a report revision before editing.");return false; }
    if (!currentJob?.operations && currentJob?.report?.reportStatus !== "Draft" && currentJob?.report && !(currentEmployee.id === samplingApprover && currentJob.report.reportStatus === "Awaiting Approval" && recordUpdates.report)) { setNotice(`Reviewed data is locked. ${employeeName(samplingApprover)} must request changes before editing.`); return false; }
    if(currentJob?.operations && (JSON.stringify(job.requiredTests)!==JSON.stringify(currentJob.requiredTests||[]) || job.otherTests!==(currentJob.otherTests||''))){setNotice('The original request is preserved. Record scope changes in Scope → Request additional work, with a reason.');return false; }
    const now = new Date().toISOString();
    const responsibleId = job.assignedEngineerId || currentJob?.responsibleId || job.employee || currentEmployee.id;
    const jobFields = {
      jobResponsibleId: job.employee || currentJob?.jobResponsibleId || currentJob?.responsibleId || currentEmployee.id,
      requestedSampleCount: job.samplingPlan.length ? String(planRecordCount(job.samplingPlan)) : job.requestedSampleCount, samplingPlan: job.samplingPlan, contextUnits: job.contextUnits, samplingSources: job.samplingPlan.map((row) => row.source as SamplingSource), samplingInstructions: job.samplingInstructions, samplingTeamIds: job.samplingTeamIds.filter(id => id && id !== job.assignedEngineerId), requiredTests: job.requiredTests, otherTests: job.otherTests, sampleCountNotes: job.samplingPlan.length ? job.samplingPlan.filter((row) => (row.note || "").trim()).map((row) => `${row.source}: ${row.note!.trim()}`).join(" · ") : job.sampleCountNotes,
      countryCode: job.countryCode, dateReceived: job.dateReceived, description: job.description, assignedEngineerId: job.assignedEngineerId, assignedDriverId: job.assignedDriverId, clientFocalPoint: job.clientFocalPoint, clientFocalPointContact: job.clientFocalPointContact, clientFocalPointEmail: job.clientFocalPointEmail, fieldArea: job.fieldArea, well: job.well, wellMode: job.wellMode, wells: job.wells, rigInstallation: job.rigInstallation,
      plannedDepth: job.plannedDepth, formation: job.formation, perforationInterval: job.perforationInterval, wellheadLocation: job.wellheadLocation,
      chokeSize: job.chokeSize, whp: job.whp, wht: job.wht, facility: job.facility, separatorId: job.separatorId, separatorStage: job.separatorStage,
      samplingPoint: job.samplingPoint, separatorPressure: job.separatorPressure, separatorTemperature: job.separatorTemperature, relatedWell: job.relatedWell,
      locationNotes: job.locationNotes, otherDescription: job.otherDescription, otherSamplingType: job.otherSamplingType, oilRate: job.oilRate, gasRate: job.gasRate, waterRate: job.waterRate,
    };
    const base: JobRecord = currentJob ?? {
      id: jobId, globalSequence: nextSequence, jobNumber: displayJobId, clientCode: client, clientName, ...jobFields, dueDate: job.dueDate,
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
    if(storedJobs.some(item=>item.id===updated.id&&isTrashed(item)))throw Error('This job is in Trash. Restore it before making changes.');
    if(!currentJob){const stored:JobRecord[]=JSON.parse(localStorage.getItem(jobsStorageKey)||'[]');assertJobNumberAvailable(updated, stored);if(stored.some(item=>item.id===updated.id))throw Error(`Job ID ${updated.jobNumber} is already in use. Refresh and try again; nothing was saved.`);}
    if(currentJob?.operations && currentJob.report?.reportStatus==="Completed")updated.report=currentJob.report;
    if(updated.operations && !operationComplete(updated) && updated.status==="Completed") updated.status="Sampling Completed";
    persistJobs(jobs.some((item) => item.id === jobId) ? jobs.map((item) => item.id === jobId ? updated : item) : [updated, ...jobs]);
    if (action) recordActivity(action, jobId, now);
    return true;
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
    if (!location.hash || location.hash==="#my-work") setWorkspaceView("my-work");
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
    setClient("");
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
      return [...current, { ...emptySamples()[0], id: `1.${String(nextNumber).padStart(2, "0")}`, sampler: isSpmcFieldSampling(samplingType) || isCasedHoleSampling(samplingType) ? DOWNHOLE_TOOL : "", bottle: "PDS" }];
    });
  }

  function removeSample(id: string) {
    setSamples((current) => current.filter((sample) => sample.id !== id));
    setExpanded((current) => current === id ? "" : current);
  }

  function deterministicSummary() {
    return samplingSummary({ clientName, samplingSource: samplingType, well: job.well, samples, jobNumber: displayJobId });
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
    if (updateCurrentJob("Report Preview", "Complete report review and approval", { "Report Preview": "In Progress" }, undefined, { samples, events, report: nextReport, status: "Report Draft" })) setNotice("Sampling report draft saved on this device.");
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
    updateCurrentJob("Final Report", "No action required", { "Report Preview": "Completed", "Final Report": "Completed" }, `approved final Sampling and Analysis Report for ${displayJobId}`, { samples, events: sortedEvents, report: nextReport, status: currentJob && !labComplete(currentJob) ? "Sampling Completed" : "Completed" });
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
    updateCurrentJob("Report Preview", "Revise report and resubmit for approval", { "Report Preview": "In Progress", "Final Report": "Not Started" }, `requested changes to Sampling and Analysis Report for ${displayJobId}`, { report: nextReport, status: "Report Draft", responsibleId: report.preparedBy || currentJob?.ownerId || currentEmployee.id });
    setNotice("Report returned to the preparer for changes");
  }

  async function downloadReportPdf(kind: "save" | "print" = "save") {
    if (report.reportStatus !== "Completed" || !report.approvedBy || !report.approvedAt) return;
    const reportElement = document.querySelector<HTMLElement>("[data-pdf-report] .sr-doc");
    if (!reportElement || pdfExporting) return;
    setPdfExporting(true);
    const fileName = `${displayJobId}-Sampling-and-Analysis-Report`;
    try {
      if (kind === "save") { await downloadSamplingReportPdf(reportElement, fileName); setNotice("The report PDF was downloaded."); }
      else await exportSamplingReportPdf(reportElement, fileName);
    } catch {
      setNotice(kind === "save" ? "The PDF could not be created. Please try again." : "The print view could not be opened. Please try again.");
    } finally {
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


  function updateSampleFieldData(id: string, field: string, value: string) {
    // Production conditions of a separator set are one record: an entry on any cylinder is written to the whole set.
    const source = samples.find((sample) => sample.id === id);
    const setWide = !!source && inSeparatorSet(source) && productionFields.includes(field.replace(/Unit$/, ""));
    setSamples((current) => current.map((sample) => sample.id === id || (setWide && inSeparatorSet(sample) && sample.set === source.set) ? {
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

  /** Job-level sampling context value with its unit (stored in contextUnits). */
  /** N/A switch for a job-level condition (e.g. no choke on a separator job). */
  function contextNaToggle(field: keyof JobDetails, label: string, isNA: boolean): ReactNode {
    return <button type="button" className={"na-toggle" + (isNA ? " is-on" : "")} aria-pressed={isNA} aria-label={`${label}: ${isNA ? "enter a value instead of N/A" : "mark not applicable"}`} onClick={() => updateJob(field, isNA ? "" : "N/A")}>{isNA ? "Enter value" : "N/A"}</button>;
  }
  /** Job-level text condition (e.g. sampling point) with the same N/A switch. */
  function contextTextField(label: string, field: keyof JobDetails, placeholder?: string): ReactNode {
    const value = String(job[field] ?? ""), isNA = value.trim().toUpperCase() === "N/A";
    return <label><span>{label}</span><div className={"value-unit" + (isNA ? " is-na" : "")}><input value={isNA ? "N/A" : value} disabled={isNA} onChange={(event) => updateJob(field, event.target.value)} placeholder={placeholder} />{contextNaToggle(field, label, isNA)}</div></label>;
  }
  function contextUnitField(label: string, field: keyof JobDetails, units: string[]): ReactNode {
    const unit = job.contextUnits[field] || units[0];
    const value = String(job[field] ?? ""), isNA = value.trim().toUpperCase() === "N/A";
    return <label><span>{label}</span><div className={"value-unit" + (isNA ? " is-na" : "")}><input inputMode="decimal" value={isNA ? "N/A" : value} disabled={isNA} onChange={(event) => updateJob(field, event.target.value)} placeholder="Value if known" /><select aria-label={`${label} unit`} disabled={isNA} value={unit} onChange={(event) => { const value = event.target.value; setJob((current) => ({ ...current, contextUnits: { ...current.contextUnits, [field]: value } })); }}>{units.map((u) => <option key={u}>{u}</option>)}</select>{contextNaToggle(field, label, isNA)}</div></label>;
  }

  const dataChip = (status: string) => <span className={"section-state " + (status === "Complete" ? "st-completed" : status === "In Progress" ? "st-in-progress" : "st-not-started")}>{status === "Complete" ? "✓ Complete" : status === "In Progress" ? "In progress" : "Not started"}</span>;
  const stepChip = (done: number, total: number) => { const st = total && done >= total ? "completed" : done > 0 ? "in-progress" : "not-started"; return <span className={"section-state st-" + st}>{st === "completed" ? "✓ Complete" : st === "in-progress" ? `In progress · ${done} of ${total}` : "Not started"}</span>; };
  function sampleDataStatus(sample: Sample) {
    if (sample.dataComplete) return "Complete";
    const started = Boolean(sample.fieldData.samplingDate || sample.fieldData.samplingTime || sample.depth || sample.notes || sample.fieldData.bhp || sample.fieldData.sampleVolume);
    return started ? "In Progress" : "Not Started";
  }

  /** Small N/A switch beside a field: one click records N/A (field turns gray and locks), a second click clears it for typing. */
  function naToggle(sample: Sample, field: string, label: string, isNA: boolean): ReactNode {
    return <button type="button" className={"na-toggle" + (isNA ? " is-on" : "")} aria-pressed={isNA} aria-label={`${label}: ${isNA ? "enter a value instead of N/A" : "mark not applicable"}`} onClick={() => updateSampleFieldData(sample.id, field, isNA ? "" : "N/A")}>{isNA ? "Enter value" : "N/A"}</button>;
  }

  function samplingTextField(sample: Sample, label: string, field: string, options: { required?: boolean; type?: string; placeholder?: string; na?: boolean } = {}): ReactNode {
    const value = field === "depth" ? sample.depth : field === "notes" ? sample.notes : sample.fieldData[field] || "";
    if (options.type === "date" || options.type === "time") { const Field = options.type === "date" ? DateInput : TimeInput; return <label><span>{label}{options.required ? " *" : ""}</span><Field required={options.required} value={value} onChange={(event) => { if (event.target.value !== value) updateSampleFieldData(sample.id, field, event.target.value); }} /></label>; }
    const isNA = !!options.na && value.trim().toUpperCase() === "N/A";
    return <label><span>{label}{options.required ? " *" : ""}</span><div className={"value-unit" + (isNA ? " is-na" : "")}><input type="text" value={isNA ? "N/A" : value} disabled={isNA} onChange={(event) => updateSampleFieldData(sample.id, field, event.target.value)} placeholder={options.placeholder} />{options.na && naToggle(sample, field, label, isNA)}</div></label>;
  }

  function samplingUnitField(sample: Sample, label: string, field: string, unitField: string, units: string[], options: { required?: boolean; placeholder?: string; na?: boolean } = {}): ReactNode {
    const value = field === "depth" ? sample.depth : sample.fieldData[field] || "";
    const isNA = !!options.na && value.trim().toUpperCase() === "N/A";
    return <label><span>{label}{options.required ? " *" : ""}</span><div className={"value-unit" + (isNA ? " is-na" : "")}><input type="text" inputMode="decimal" value={isNA ? "N/A" : value} disabled={isNA} onChange={(event) => updateSampleFieldData(sample.id, field, event.target.value)} placeholder={options.placeholder || "Value"} /><select aria-label={`${label} unit`} disabled={isNA} value={sample.fieldData[unitField] || units[0]} onChange={(event) => updateSampleFieldData(sample.id, unitField, event.target.value)}>{[...new Set([...(sample.fieldData[unitField] && !units.includes(sample.fieldData[unitField]) ? [sample.fieldData[unitField]] : []), ...units])].map((unit) => <option key={unit}>{unit}</option>)}</select>{options.na && naToggle(sample, field, label, isNA)}</div></label>;
  }

  function samplingSelectField(sample: Sample, label: string, field: string, options: string[]): ReactNode {
    return <label><span>{label}</span><select value={sample.fieldData[field] || options[0]} onChange={(event) => updateSampleFieldData(sample.id, field, event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }

  function standardDataSheetErrors(sample: Sample) {
    return standardSheetErrors(sample);
  }


  /** Separator cylinders of one set share the production conditions during sampling. */
  function inSeparatorSet(sample: Sample) { return !!sample.set && (sample.samplingSource || samplingType) === "Separator Sampling"; }

  /** Full data sheet of one sample, or only its production conditions (shown once per separator set). */
  function standardDataSheetForm(sample: Sample, only?: "production"): ReactNode {
    const U = (label: string, field: string, units: string[], unitField = field + "Unit", placeholder?: string) => samplingUnitField(sample, label, field, unitField, units, { required: true, placeholder, na: true });
    const T = (label: string, field: string, placeholder = "Value") => samplingTextField(sample, label, field, { required: true, placeholder, na: true });
    const filled = (field: string) => Boolean((field === "depth" ? sample.depth : sample.fieldData[field] || "").trim());
    const section = (num: string, title: string, hint: string, fields: string[], body: ReactNode, open = false) => {
      const done = fields.filter(filled).length, st = done >= fields.length ? "completed" : done ? "in-progress" : "not-started";
      return <details className={"sheet-section st-" + st} open={open || undefined}>
        <summary><span className="sheet-num">{num}</span><span className="sheet-title"><strong>{title}</strong><small>{hint}</small></span><span className={"section-state st-" + st}>{st === "completed" ? "✓ Complete" : `${done} of ${fields.length} filled`}</span></summary>
        <div className="sheet-body">{body}</div>
      </details>;
    };
    const group = (title: string, body: ReactNode) => <div className="sheet-group"><h4>{title}</h4><div className="technical-field-grid">{body}</div></div>;
    const natureValue = sample.fieldData.sampleNature || "";
    const natureList = sampleNatureOptions.some(([code]) => code === natureValue) || !natureValue ? sampleNatureOptions : [[natureValue, natureValue] as [string, string], ...sampleNatureOptions];
    const pointValue = sample.fieldData.samplingPoint || "";
    const pointList = !pointValue || samplingPointOptions.includes(pointValue) ? samplingPointOptions : [pointValue, ...samplingPointOptions];
    const shared = inSeparatorSet(sample), atmospheric = isAtmospheric(sample);
    const production = section(shared ? `S${sample.set}` : "4", shared ? `Set ${sample.set} · Separator sampling conditions` : "Production conditions during sampling", shared ? "Entered once for the set; applies to every cylinder of the set" : "Measured values with units, or N/A where a condition does not apply", productionFields, <>
        {group("Well", <>{U("Bottomhole Pressure (BHP)", "bhp", pressureUnits)}{U("Bottomhole Temperature (BHT)", "bht", temperatureUnits)}{U("Wellhead Pressure (WHP)", "whp", pressureUnits)}{U("Wellhead Temperature (WHT)", "wht", temperatureUnits)}{U("Choke Size", "chokeSize", chokeUnits)}{T("Stable Since", "stableSince", "Date/time")}</>)}
        {group("Gas composition", <>{U("H₂S", "h2s", concentrationUnits)}{U("CO₂", "co2", concentrationUnits)}</>)}
        {group("Separator & gas", <>{U("Separator Pressure", "separatorPressure", pressureUnits)}{U("Separator Temperature", "separatorTemperature", temperatureUnits)}{U("Gas Rate (std)", "gasRate", gasRateUnits)}{U("Gas Gravity", "gasGravity", gasGravityUnits)}{U("Gas Differential Pressure", "gasDifferentialPressure", pressureUnits)}{U("Gas Pressure", "gasPressure", pressureUnits)}{U("Gas Temperature", "gasTemperature", temperatureUnits)}{T("Fb Factor (dimensionless)", "fbFactor")}{T("Fpv Factor (dimensionless)", "fpvFactor")}</>)}
        {group("Oil & water", <>{U("Oil Rate", "oilRate", liquidRateUnits)}{T("Corrected By", "correctedBy", "Name or reference")}{U("Oil Gravity", "condensateGravity", liquidGravityUnits)}{U("Oil Line Temperature", "oilLineTemperature", temperatureUnits)}{U("Water Rate", "waterRate", liquidRateUnits)}</>)}
        {group("Ratios", <>{U("GOR", "gor", gorUnits)}{U("CGR", "cgr", cgrUnits)}{U("WOR", "wor", worUnits)}{U("BSW", "bsw", bswUnits)}</>)}
      </>);
    if (only === "production") return production;
    return <>
      <div className="standard-sheet-toolbar"><div><strong>Sample data sheet</strong><small>Fill every field and pick its unit. If a condition does not apply, press <span className="na-toggle is-sample">N/A</span> beside that field. Nothing is set to N/A automatically.</small></div></div>
      {section("1", "Identification", "When, where and what was sampled", ["samplingDate", "samplingTime", "sampleNature", "samplingPoint", "depth", "flowPeriod", "formation", "perforations"], <div className="technical-field-grid">
        {samplingTextField(sample, "Sampling Date", "samplingDate", { required: true, type: "date" })}
        {samplingTextField(sample, "Sampling Time", "samplingTime", { required: true, type: "time" })}
        <label><span>Sample Nature *</span><select value={natureValue} onChange={(event) => updateSampleFieldData(sample.id, "sampleNature", event.target.value)}><option value="">Select sample nature</option>{natureList.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label><span>Sampling Point *</span><select value={pointValue} onChange={(event) => updateSampleFieldData(sample.id, "samplingPoint", event.target.value)}><option value="">Select sampling point</option>{pointList.map((point) => <option key={point}>{point}</option>)}</select></label>
        {U("Depth", "depth", depthUnits, "depthUnit", "Depth")}
        {U("Flow Period", "flowPeriod", flowPeriodUnits)}
        {T("Formation", "formation")}
        {U("Perforations", "perforations", depthUnits, "perforationsUnit", "e.g. 2500–2510")}
      </div>, true)}
      {section("2", "Shipping conditions", atmospheric ? "Container and sample volumes and the final container condition. Press N/A where a pressure does not apply" : "Cylinder and sample volumes and the final cylinder condition", ["sampleBottleVolume", "sampleVolume", "fluidRemaining", "gasCapCreated", "finalPressure", "finalTemperature"], <div className="technical-field-grid">
        {U(atmospheric ? "Container Volume" : "Sample Cylinder Volume", "sampleBottleVolume", volumeUnits)}{U("Sample Volume", "sampleVolume", volumeUnits)}{U("Fluid Remaining", "fluidRemaining", volumeUnits)}
        {samplingSelectField(sample, "Gas Cap Created", "gasCapCreated", ["Yes", "No", "N/A"])}
        {U(atmospheric ? "Final Container Pressure" : "Final Cylinder Pressure", "finalPressure", pressureUnits)}{U(atmospheric ? "Final Container Temperature" : "Final Cylinder Temperature", "finalTemperature", temperatureUnits)}
      </div>)}
      {section("3", "Transfer conditions", "Opening pressure at reservoir temperature and at ambient, and the transfer conditions", matchedFields, <>
        {group("Opening pressure @ reservoir temperature", <>{U("Opening Pressure", "openingPressureReservoir", pressureUnits)}{U("Reservoir Temperature", "openingTemperatureReservoir", temperatureUnits)}</>)}
        {group("Opening pressure @ ambient temperature", <>{U("Opening Pressure", "openingPressureAmbient", pressureUnits)}{U("Ambient Temperature", "openingTemperatureAmbient", temperatureUnits)}</>)}
        {group("Transfer", <>{U("Transfer Pressure", "transferPressure", pressureUnits)}{U("Transfer Temperature", "transferTemperature", temperatureUnits)}{U("Transfer Duration", "transferDuration", durationUnits)}</>)}
      </>)}
      {shared ? <p className="set-conditions-note">Separator sampling conditions are entered once for Set {sample.set}, above this set’s samples.</p> : production}
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
  /** Opens the exact task. Opening clears its "New" marker only; the task stays in My actions until it is actually done. */
  function openWorkItem(item: WorkItem) {
    const target = jobs.find((job) => job.id === item.jobId);
    if (!target) return;
    markSeen(item.events);
    if ("editor" in item.open) { resumeJob(target); if (item.open.editor !== "job") setStage(item.open.editor); if (item.open.sample) setExpanded(item.open.sample); return; }
    if (item.open.tab === "cylinders") { setSamplingTab("cylinders"); setWorkspaceView("sampling"); return; }
    openOperation(target, item.open.tab);
  }
  function openSamplingTask(item: JobRecord) {
    setReturnTo("sampling");
    markSamplingSeen(item);
    const status = samplingStatus(item, responsibilities);
    if (status.tab === "sampling" && (hasPermission("sampling") || hasPermission("jobDetails")) && samplingWorkers(item).includes(currentEmployee?.id || "") && samplingStarted(item)) { resumeJob(item); setStage(samplingStageFor(item)); return; }
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
    if (updateCurrentJob("Sampling Data", "Complete sample records", { "Sampling Data": "In Progress" }, undefined, { samples, events })) setNotice("Sampling Data draft saved on this device.");
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
    updateCurrentJob("Report Preview", "Review and generate sampling report", { "Sampling Data": "Completed", "Report Preview": "In Progress" }, `completed Sampling Data for ${displayJobId}`, { samples, events, report: nextReport, status: "Report Draft" });
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
      : field === "containerType" ? (value === "Bottle" ? { containerId: "", containerVolume: "" } : { bottle: "", bottleSerial: "", bottleCapacity: "", containerId: "", containerVolume: "" }) : {};
    // A glass bottle or IATA can volume is also the container volume on the data sheet.
    const [volume, volumeUnit] = field === "containerVolume" ? value.split(" ") : [];
    const nextSamples = samples.map((sample) => sample.id === id ? { ...sample, [field]: value, ...bottleDetails, ...(volume ? { fieldData: { ...sample.fieldData, sampleBottleVolume: volume, sampleBottleVolumeUnit: volumeUnit } } : {}), dataComplete: false, dataCompletedBy: "", dataCompletedAt: "", preparedBy: currentEmployee?.id || sample.preparedBy, preparedAt: sample.preparedAt || now } : sample);
    const nextTasks = coordinationTasks.map((task) => ["bottle", "bottleSerial", "bottleCapacity", "containerType", "containerId", "containerVolume"].includes(field) && task.label === "Assign the required cylinders" ? { ...task, completed: false, completedBy: undefined, completedAt: undefined } : task);
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
      if (!coordinationDetails.sampleOwner.trim()) errors.push("Sample Owner is required for an open-hole lab transfer.");
      if (!coordinationDetails.requiredItems.trim()) errors.push("Required Transfer Items must be recorded.");
    } else if (samplingType === "Wellhead Sampling" || samplingType === "Separator Sampling") {
      if (!coordinationDetails.samplingPointType.trim()) errors.push("Sampling Point Type is required.");
      if (!coordinationDetails.samplingPointSize.trim()) errors.push("Sampling Point Size is required.");
      if (!coordinationDetails.requiredSampleKit.trim()) errors.push("Required Sample Kit must be recorded.");
      if (!samples.length || samples.some((sample) => !containerComplete(sample))) errors.push("Complete each receiving cylinder type and serial number, or the glass bottle / IATA can volume.");
      if (coordinationDetails.toolsRequired === "To Be Confirmed") errors.push("Confirm whether tools are required.");
      if (coordinationDetails.toolsRequired === "Required" && coordinationDetails.toolsAvailability === "To Be Confirmed") errors.push("Confirm tools availability.");
      if (samplingType === "Separator Sampling" && !job.samplingPoint.trim()) errors.push("Separator Sampling Point is required.");
    } else if (samplingType && samplingType !== "Other") {
      if (!coordinationDetails.requiredSampleKit.trim()) errors.push("Required Sample Kit must be recorded.");
      if (!samples.length || samples.some((sample) => !containerComplete(sample))) errors.push("Complete each receiving cylinder type and serial number, or the glass bottle / IATA can volume.");
      if (coordinationDetails.toolsRequired === "To Be Confirmed") errors.push("Confirm whether tools are required.");
    }
    // Each cylinder must be Ready and not held by another job (Sampling → Cylinders).
    for (const sample of samples) if (!isAtmospheric(sample) && sample.bottleSerial?.trim()) { const st = cylStatus(sample.bottleSerial); if (!selectable(st, currentJob?.id || jobId, sample.id)) errors.push(`Sample ${sample.id}: cylinder ${sample.bottleSerial} is ${cylinderStateLabel[st.state]}${st.job && st.job.id !== (currentJob?.id || jobId) ? ` on job ${st.job.jobNumber}` : st.job ? " (chosen for more than one sample)" : ""}. Choose a Ready cylinder.`); }
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

  /** Ticks or unticks a checklist item. Returns false when the tick is refused because its details are missing. */
  function toggleCoordinationTask(taskId: string, completed: boolean): boolean {
    if (!currentEmployee) return false;
    const target = coordinationTasks.find((task) => task.id === taskId);
    if (completed && target) {
      let error = "";
      if (target.label === "Assign the required sample kit" && !coordinationDetails.requiredSampleKit.trim()) error = "Enter the sample kit details before ticking this item.";
      if (target.label === "Assign the required cylinders" && (!samples.length || samples.some((sample) => !containerComplete(sample)))) error = "Enter the cylinder type and serial number, or the glass bottle / IATA can volume, for every sample before ticking this item.";
      if (target.label.includes("sampling point") && target.label.includes("type") && !coordinationDetails.samplingPointType.trim()) error = "Enter the sampling point type.";
      if (target.label.includes("sampling point") && target.label.includes("size") && !coordinationDetails.samplingPointSize.trim()) error = "Enter the sampling point size.";
      if (target.label === "Confirm separator sampling point" && !job.samplingPoint.trim()) error = "Enter the separator sampling point.";
      if (error) { setPreparationError([error]); return false; }
    }
    const now = new Date();
    const timestamp = now.toISOString();
    const nextTasks = coordinationTasks.map((item) => item.id === taskId ? { ...item, completed, completedBy: completed ? currentEmployee.id : undefined, completedAt: completed ? timestamp : undefined } : item);
    setCoordinationTasks(nextTasks);
    setPreparationError([]);
    if (!currentJob) return true;
    const task = nextTasks.find((item) => item.id === taskId);
    let nextEvents = events;
    if (completed && task) {
      const date = localDate(now);
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      nextEvents = [...events, { date, time, description: `Pre-job checklist completed: ${task.label}`, createdBy: currentEmployee.id, createdAt: timestamp }].sort((left, right) => `${left.date || ""}T${left.time}`.localeCompare(`${right.date || ""}T${right.time}`));
      setEvents(nextEvents);
    }
    updateCurrentJob("Sampling Preparation", "Complete pre-job coordination", { "Sampling Preparation": "In Progress" }, completed && task ? `completed pre-job task: ${task.label}` : undefined, { coordinationTasks: nextTasks, coordinationDetails, events: nextEvents });
    return true;
  }

  /** Job Setup: ticks or unticks a sampling type. The first type in the plan is the primary one used for preparation. */
  function toggleSamplingType(type: SamplingSource) {
    const plan = job.samplingPlan.some((row) => row.source === type) ? job.samplingPlan.filter((row) => row.source !== type) : [...job.samplingPlan, newPlanRow(type)];
    setJob((current) => ({ ...current, samplingPlan: plan }));
    setDispatchReview(false); setJobErrors([]);
    const primary = plan[0]?.source as SamplingSource | undefined;
    if (primary) { if (primary !== samplingType) selectSamplingType(primary); }
    else { setSamplingType(""); setSamplingRequired(null); setCoordinationTasks([]); setSamples([]); }
  }
  function updatePlanRow(source: string, patch: Partial<SamplingPlanRow>) {
    setDispatchReview(false); setJobErrors([]);
    setJob((current) => ({ ...current, samplingPlan: current.samplingPlan.map((row) => {
      if (row.source !== source) return row;
      const next = { ...row, ...patch };
      // Changing the number of sets keeps oil and gas in step unless they were changed on purpose.
      if (isSeparator(row) && patch.count !== undefined) { if (row.oil === row.count) next.oil = patch.count; if (row.gas === row.count) next.gas = patch.count; }
      return next;
    }) }));
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
      return planned.map((sample) => ({ ...sample, sampler: isSpmcFieldSampling(type) ? DOWNHOLE_TOOL : sample.sampler, samplerSerial: isSpmcFieldSampling(type) ? sharedSerial : sample.samplerSerial, fieldData: { ...sample.fieldData, sampleNature: isSpmcFieldSampling(type) ? "OHS" : sample.fieldData.sampleNature }, preparedBy: sample.preparedBy || currentEmployee?.id || "", preparedAt: sample.preparedAt || now }));
    });
    setExpanded((current) => current || "1.01");
  }

  function addExtraSample() {
    if (samples.length >= 20) return;
    const now = new Date().toISOString();
    const id = `1.${String(samples.length + 1).padStart(2, "0")}`;
    const shared = samples[0];
    const extra = { ...emptySamples()[0], id,
      sampler: isSpmcFieldSampling(samplingType) || isCasedHoleSampling(samplingType) ? DOWNHOLE_TOOL : "",
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
    // Confirm only a save that actually happened; a refusal leaves its own explanation.
    if (updateCurrentJob("Sampling Preparation", "Complete pre-job coordination and preparation", { "Sampling Preparation": "In Progress" }, undefined, { coordinationTasks, coordinationDetails })) setNotice("Sampling Preparation draft saved on this device.");
  }

  function completePreparation() {
    const errors: string[] = coordinationErrors();
    if (!requiresEquipmentPreparation(samplingType)) errors.push("Select an equipment-preparation sampling type to complete this workflow.");
    if (!job.well.trim()) errors.push("Well is required for field sampling.");
    if (isCasedHoleSampling(samplingType) && samples.length < 3 && !preparationNotes.trim() && !job.sampleCountNotes.trim()) errors.push("Cased Hole sampling defaults to at least 3 samples. Add Preparation Notes to document an explicit lower sample count.");
    const incompleteSamples = samples.filter((sample) => !sample.sampler || !sample.samplerSerial.trim() || !containerComplete(sample));
    if (incompleteSamples.length) errors.push(`Complete required sampler and cylinder details for ${incompleteSamples.map((sample) => `Sample ${sample.id}`).join(", ")}.`);
    if (errors.length) {
      setPreparationError(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const now = new Date().toISOString();
    setPreparationCompletedAt(now);
    const preparedSamples = samples.map((sample) => ({ ...sample, preparedBy: sample.preparedBy || currentEmployee?.id || "", preparedAt: sample.preparedAt || preparationStartedAt || now }));
    setSamples(preparedSamples);
    updateCurrentJob("Sampling Data", isCasedHoleSampling(samplingType) ? "Enter bottomhole sample data" : "Enter open-hole field sample data", { "Sampling Preparation": "Completed", "Sampling Data": "In Progress" }, `completed Sampling Preparation for ${displayJobId}`, { samples: preparedSamples });
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
    updateCurrentJob("Sampling Data", `Enter ${samplingType} data`, { "Sampling Preparation": "Completed", "Sampling Data": "In Progress" }, `completed Sampling Preparation for ${displayJobId}`, { samples });
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
    const plan = job.samplingPlan;
    // Jobs sent before several sampling types existed keep their single type and count.
    if (!plan.length && !(currentJob && !isDraft(currentJob) && samplingType)) errors.push("Select at least one sampling type.");
    if (plan.some((row) => !isMpsrLabTransfer(row.source as SamplingSource) && row.source !== "Other")) {
      if (!job.clientFocalPoint.trim()) errors.push("Enter the Client Focal Point.");
      if (!job.clientFocalPointContact.trim()) errors.push("Enter the Focal Point Contact Number.");
    }
    if (plan.some((row) => row.source === "Other") && !job.otherSamplingType.trim()) errors.push("Specify the other sampling type.");
    if (plan.length) errors.push(...planErrors(plan, sourceLabel));
    // Jobs sent before instructions existed stay editable without them.
    if (sending && !job.samplingInstructions.trim()) errors.push("Write the sampling instructions for the sampling team.");
    if (!job.assignedEngineerId) errors.push("Assign the accountable sampling employee.");
    for (const id of [job.assignedEngineerId, ...job.samplingTeamIds].filter(Boolean)) {
      const person = demoEmployees.find(e => e.id === id);
      if (!person?.active) errors.push(`${person?.name || id} is not an active employee.`);
    }
    if (!demoEmployees.some(e => e.id === job.assignedDriverId && e.active)) errors.push('Assign an active driver.');
    return errors;
  }

  function saveDraft() {
    if (!currentEmployee || !hasPermission("createJob")) { setNotice("You are not authorized to create jobs."); return; }
    if (currentJob && !isDraft(currentJob)) return;
    if (!currentJob && !selectedClient?.active) { setJobErrors(["Select an active client before saving a draft; it forms part of the job ID."]); return; }
    setJobErrors([]); setDispatchReview(false);
    const reservedId = currentJob?.id || jobId;
    const draftEvents = currentJob ? events : withAutoEvent(events, `Job ${displayJobId} created as a draft by ${employeeName(currentEmployee.id)}`);
    try {
      if (!updateCurrentJob("Job Setup", "Complete the draft and send it to Sampling", {}, `${currentJob ? "Saved" : "Created"} draft ${displayJobId}`, { ...(currentJob ? {} : { id: reservedId, jobNumber: displayJobId, globalSequence: nextSequence, events: draftEvents }), status: "Draft" })) return;
    } catch (error) { setJobErrors([(error as Error).message]); return; }
    if (!currentJob) setEvents(draftEvents);
    if (!currentJob) { window.localStorage.setItem(globalCounterStorageKey, String(nextSequence)); setGlobalCounter(nextSequence); setCreatedJobId(reservedId); }
    setNotice(`Draft ${displayJobId} saved on this device. It has not been sent to Sampling.`);
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
      updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, `Updated job details for ${currentJob.jobNumber}`);
      setWorkflowJobId(currentJob.id);
      setWorkspaceView("workflow");
      return;
    }
    const reservedJobId = currentJob?.id || jobId;
    const reservedSequence = currentJob?.globalSequence || nextSequence;
    const requiresSampling = job.samplingPlan.some((row) => samplingIsRequired(row.source as SamplingSource));
    const natureOf = (source: SamplingSource) => isCasedHoleSampling(source) ? "BHS" : isSpmcFieldSampling(source) ? "OHS" : isMpsrLabTransfer(source) ? "OHT" : source === "Wellhead Sampling" ? "WHS" : source === "Separator Sampling" ? "SEP" : source === "Station Sampling" ? "STN" : "";
    // One record per sample (per cylinder for Separator Sampling), numbered in one running sequence across all types.
    const plannedSamples: Sample[] = planRecords(job.samplingPlan).map((record, index) => {
      const source = record.source as SamplingSource;
      return {
        // Preparation is recorded later by whoever prepares the sample, never by the job creator.
        ...(samples[index] || emptySamples()[0]), preparedBy: "", preparedAt: "", id: record.id, samplingSource: source, phase: record.phase, set: record.set,
        sampler: isSpmcFieldSampling(source) || isCasedHoleSampling(source) ? DOWNHOLE_TOOL : "",
        fieldData: { ...(samples[index]?.fieldData || defaultFieldData()), sampleNature: natureOf(source), samplingPoint: samples[index]?.fieldData.samplingPoint || samplingPointFor(record.phase) },
      };
    });
    const crew = [`Accountable: ${employeeName(job.assignedEngineerId)}`, ...job.samplingTeamIds.filter((id) => id !== job.assignedEngineerId).map((id) => `Backup: ${employeeName(id)}`), `Driver: ${employeeName(job.assignedDriverId)}`].join(" · ");
    const sentEvents = withAutoEvent(events, `Sent to Sampling by ${employeeName(currentEmployee!.id)} · ${job.samplingPlan.map((row) => `${sourceLabel(row.source)} (${rowSummary(row)})`).join(", ")} · ${crew}`);
    const nextAction = requiresSampling ? "Complete sampling preparation" : "Complete pre-job coordination";
    try {
      updateCurrentJob("Sampling Preparation", nextAction, { "Job Setup": "Completed", "Sampling Preparation": "In Progress" }, `Sent job ${displayJobId} to Sampling`, { id: reservedJobId, jobNumber: displayJobId, globalSequence: reservedSequence, samplingRequired: requiresSampling, samplingSource: samplingType as SamplingSource, holeType: "", scopeOfWorkAttachment: scopeAttachment || undefined, samples: plannedSamples, events: sentEvents, coordinationTasks: createCoordinationTasks(samplingType, coordinationTasks), coordinationDetails, status: "Job Created" }, true);
    } catch (error) { setJobErrors([(error as Error).message]); setDispatchReview(false); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setSamplingRequired(requiresSampling);
    setSamples(plannedSamples);
    setEvents(sentEvents);
    setExpanded("1.01");
    if (!currentJob) { window.localStorage.setItem(globalCounterStorageKey, String(reservedSequence)); setGlobalCounter(reservedSequence); }
    setDispatchReview(false);
    const team = [job.assignedEngineerId, ...job.samplingTeamIds.filter(id => id !== job.assignedEngineerId)];
    setNotice(`Job ${displayJobId} sent to Sampling. Received by ${team.map((id, index) => employeeName(id) + (index === 0 ? " (accountable)" : " (backup)")).join(", ")}; driver ${employeeName(job.assignedDriverId)}. New stage: Sampling · Next action: ${nextAction}. The laboratory has a heads-up. No email was sent.`);
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
    // A refused save (e.g. sampling data locked for review) must not leave an unsaved entry on screen.
    if (currentJob) { if (!updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, "Created Sequence of Events entry", { events: nextEvents })) { setEvents(events); return; } }
    else setNotice("Sequence of Events entry added. It will be saved when the job is created.");
    setEventDraft({ date: localDate(), time: "", description: "" });
  }

  function removeEvent(itemToRemove: SequenceEvent) {
    const nextEvents = events.filter((item) => item !== itemToRemove);
    setEvents(nextEvents);
    if (currentJob && !updateCurrentJob(currentJob.currentStage, currentJob.nextAction, {}, "Removed Sequence of Events entry", { events: nextEvents })) setEvents(events);
  }

  function reassignJob(employeeId: string) {
    if (!currentJob || !currentEmployee) return;
    const now = new Date().toISOString();
    setJob((current) => ({ ...current, assignedEngineerId: employeeId }));
    const next = jobs.map((item) => item.id !== currentJob.id ? item : { ...item, responsibleId: employeeId, assignedEngineerId: employeeId, lastUpdatedById: currentEmployee.id, lastUpdatedAt: now, stages: item.stages.map((workflow) => workflow.status === "In Progress" ? { ...workflow, assignedTo: employeeId, lastUpdatedBy: currentEmployee.id, lastUpdatedAt: now } : workflow) });
    persistJobs(next);
    recordActivity(`Reassigned responsibility to ${employeeName(employeeId)}`, currentJob.id, now);
  }

  /** Switches between the labelled demo setup and the saved Settings. Neither is overwritten. */
  function toggleDemoSetup() {
    const current = readDemoSetup(); if (!current) return;
    const next = { ...current, enabled: !current.enabled }; saveDemoSetup(next); setDemoSetupState(next);
    setNotice(next.enabled ? "Demo setup on: demo teams and QC are used. Your saved Settings are unchanged." : "Demo setup off: your saved Settings are used.");
  }
  /** Fills an empty browser with fictional DEMO jobs so visitors can explore the workflow. */
  async function loadDemoData() {
    if (jobs.length || window.localStorage.getItem(jobsStorageKey) && JSON.parse(window.localStorage.getItem(jobsStorageKey) || "[]").length) { setNotice("Demo data is only added to a browser with no saved jobs."); return; }
    setDemoLoading(true);
    try {
      const demoJobs = await buildDemoJobs((name, content) => storeWorkbook(new File([content], name, { type: name.endsWith(".pdf") ? "application/pdf" : "text/csv" })));
      if (!clients.some((item) => item.code === demoClient.code)) { const nextClients = [...clients, demoClient]; window.localStorage.setItem(clientStorageKey, JSON.stringify(nextClients)); setClients(nextClients); }
      persistJobs(demoJobs);
      // The demo's own teams and QC are stored separately (vaps-demo-setup-v1); saved Settings are not touched.
      const setup: DemoSetup = { enabled: true, ...demoConfiguration, loadedAt: new Date().toISOString() }; saveDemoSetup(setup); setDemoSetupState(setup);
      const sequence = Math.max(globalCounter, ...demoJobs.map((item) => item.globalSequence));
      window.localStorage.setItem(globalCounterStorageKey, String(sequence)); setGlobalCounter(sequence);
      recordActivity("Loaded DEMO jobs", demoJobs[0].id);
      setNotice("Demo jobs loaded with the labelled demo setup (demo teams and QC). Use “Demo: view as employee” at the top to see each person’s work.");
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
    if (item.active && client === item.code) setClient("");
  }

  function renderSequenceEventsPanel() {
    // Folded by default so the work on the page comes first; opened with one click.
    return <details className="panel sequence-events-panel persistent-events-panel events-fold-panel">
      <summary className="panel-heading premium-heading"><div><span className="eyebrow">SHARED JOB TIMELINE</span><h2>Sequence of Events</h2><p>Every entry for this job, in date and time order. Open to view or add an event.</p></div><span className="event-count">{events.length} EVENTS</span><em className="events-fold-toggle">Show</em></summary>
      <div className="events-table-wrap"><table className="events-table"><thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Entered By</th><th aria-label="Actions" /></tr></thead><tbody>{sortedEvents.length ? sortedEvents.map((item, index) => <tr key={item.createdAt || `${item.date}-${item.time}-${index}`}><td>{ukDate(item.date || job.dateReceived)}</td><td><strong>{item.time}</strong></td><td>{item.description}</td><td><strong>{employeeName(item.createdBy)}</strong><small>{formatDateTime(item.createdAt)}</small></td><td><button type="button" onClick={() => removeEvent(item)} aria-label="Remove event">×</button></td></tr>) : <tr className="events-empty-row"><td colSpan={5}>No events recorded yet. Add the first job event below.</td></tr>}</tbody></table></div>
      <div className="event-entry"><label><span>Event Date</span><DateInput value={eventDraft.date} onChange={(event) => setEventDraft((current) => ({ ...current, date: event.target.value }))} /></label><label><span>Event Time</span><TimeInput value={eventDraft.time} onChange={(event) => setEventDraft((current) => ({ ...current, time: event.target.value }))} /></label><label><span>Event Description</span><input value={eventDraft.description} onChange={(event) => setEventDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Describe the job, field, transfer, or report event…" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEvent(); } }} /></label><button type="button" className="outline-button" onClick={addEvent}>+ Add Event</button></div>
    </details>;
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

  if (!authReady) return <div className="login-loading"><img src={assetUrl("/vaps-logo.png")} alt="VAPS" /><span>Loading local workspace…</span></div>;

  if (!currentEmployee) return (
    <main className="login-page">
      <section className="login-visual" aria-label="VAPS PVT Lab & Sampling introduction">
        <div className="login-brand"><img src={assetUrl("/vaps-logo.png")} alt="VAPS" /><span>INTERNAL OPERATIONS</span></div>
        <div className="login-visual-copy"><span className="eyebrow">PETROLEUM LABORATORY SERVICES</span><h1>Technical workflows.<br />Clear responsibility.</h1><p>A focused workspace for managing PVT laboratory jobs, sampling records, and operational accountability.</p></div>
        <div className="login-security"><span className="status-dot" /><div><strong>Local demo environment</strong><small>Prototype credentials and workflow data stay on this device.</small></div></div>
      </section>
      <section className="login-form-side">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-mobile-logo"><img src={assetUrl("/vaps-logo.png")} alt="VAPS" /></div>
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
          <img className="brand-logo" src={assetUrl(company.logo)} alt={company.displayName} />
          <small className="tool-title">PVT Lab <span>&amp; Sampling</span></small>
        </div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">WORKSPACE</p>{hasPermission("createJob") && <button type="button" className="nav-item" onClick={startNewJob}><Plus size={18} /> Create new job</button>}
          {navItems.map((item, index) => { const NavIcon = navIcons[index]; const view = ({ Dashboard: "dashboard", "My work": "my-work", Jobs: "jobs", Sampling: "sampling", Laboratory: "pvt-lab", Inventory: "inventory", Settings: "settings" } as Record<string, string>)[item]; if (!canView(view)) return null;
            // Inside a job, the view the employee came from stays highlighted.
            const here = workspaceView === "workflow" ? returnTo : workspaceView === "planning" ? "my-work" : workspaceView === "overview" ? "dashboard" : workspaceView;
            const badge = item === "Sampling" ? nowItems.filter((i) => i.area === "Sampling").length : item === "Laboratory" ? nowItems.filter((i) => ["PVT", "Chemical", "QC"].includes(i.area)).length : item === "My work" ? nowItems.length : 0;
            return (
            <button key={item} className={here === view ? "nav-item active" : "nav-item"} type="button" aria-current={here === view ? "page" : undefined} onClick={() => { if (view === "pvt-lab") setLabJobId(""); setWorkspaceView(view as WorkspaceView); }}>
              <span className="nav-icon" aria-hidden="true"><NavIcon size={19} strokeWidth={1.8} /></span>{item}{badge > 0 && <span className="nav-badge" aria-label={`${badge} task(s) to do now`}>{badge}</span>}
              {item === "Jobs" && <span className="nav-count">{registerBase.length}</span>}
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

      {(() => { const position = directory.positions.find((p) => p.id === currentEmployee.positionId)?.name || currentEmployee.role; const department = directory.departments.find((d) => d.id === currentEmployee.departmentId)?.name; const teamsOf = (["PVT", "Chemical"] as const).filter((t) => labTeams[t]?.includes(currentEmployee.id)).map((t) => teamName(t) + " team"); const duties = (Object.keys(responsibilityLabels) as (keyof typeof responsibilityLabels)[]).filter((k) => roleHolder(responsibilities, k, demoEmployees) === currentEmployee.id).map((k) => responsibilityLabels[k]); const positionOf = (p: Employee) => directory.positions.find((o) => o.id === p.positionId)?.name || p.role; return <div className="identity-bar" role="region" aria-label="Current employee">
        <div className="identity-who"><span className="avatar" aria-hidden="true">{currentEmployee.initials}</span><div><small>Viewing as</small><strong>{currentEmployee.name}</strong><span>{[position, department && department !== position ? department : "", ...teamsOf].filter(Boolean).join(" · ")}</span></div></div>
        <div className="identity-duties" aria-label="Configured duties">{duties.length ? duties.map((d) => <span key={d} className="duty-chip">{d}</span>) : <span className="duty-none">No configured duties · assigned work only</span>}</div>
        <div className="identity-switch"><label>Demo: view as employee<select aria-label="Demo: view as employee" value={currentEmployee.id} onChange={e=>{if(window.confirmSettingsLeave&&!window.confirmSettingsLeave())return;const person=demoEmployees.find(p=>p.id===e.target.value&&p.active);if(person){setCurrentEmployee(person);sessionStorage.setItem(sessionStorageKey,person.id);setWorkspaceView('my-work');}}}>{demoEmployees.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · {positionOf(p)}</option>)}</select></label><small>Only changes whose view you see. Work is assigned inside a job.</small></div>
        {demoSetup && <div className={"demo-setup-pill" + (demoActive ? " is-on" : "")}><span>Demo setup {demoActive ? "on" : "off"}</span><button type="button" className="text-button" onClick={() => toggleDemoSetup()}>{demoActive ? "Use saved Settings" : "Use demo setup"}</button></div>}
      </div>; })()}<main className={workspaceView === "my-work" ? "inbox-main" : ""}>
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Open menu">☰</button>
          <div className="breadcrumb"><span>{workspaceView === "inventory" ? "Inventory" : workspaceView === "settings" ? "Settings" : workspaceView === "profile" ? "Employee" : "Workspace"}</span><b>/</b><strong>{workspaceView === "workflow" ? (workflowJob?.jobNumber || "Job workflow") : workspaceView === "inventory" ? "Cylinder inventory" : workspaceView === "settings" ? ({company:"Company",clients:"Clients",employees:"Employees",authorization:"Authorization",tests:"Tests",departments:"Departments & Positions"}[settingsPage] || "Overview") : workspaceView === "profile" ? "My Profile" : workspaceView === "my-work" ? "My work" : workspaceView === "dashboard" ? "Dashboard" : workspaceView === "planning" ? "Weekly plan" : workspaceView === "overview" ? "Activity log" : workspaceView === "jobs" ? "Jobs" : workspaceView === "sampling" ? (samplingTab === "reports" ? "Sampling · Sampling Reports" : "Sampling") : workspaceView === "pvt-lab" ? "Laboratory" : client || currentJob ? displayJobId : "New job"}</strong></div>
          <div className="top-actions">
            <button className="settings-shortcut" type="button" onClick={() => { setWorkspaceView("settings"); }}><Settings size={18} aria-hidden="true" />Settings</button>
            {workspaceView === "my-work" || workspaceView === "dashboard" ? <span className="top-date">{dashboardDate}</span> : <span className="local-pill"><span className="status-dot" /> Local demo</span>}
            <button className="icon-button" type="button" aria-label="Notifications">◌<span className="notification-dot" /></button>
            <button className="top-avatar" type="button" onClick={() => setWorkspaceView("profile")} aria-label="Open my profile">{currentEmployee.initials}</button>
          </div>
        </header>

        <div className="page-wrap">
          {workspaceView !== "settings" && !!notice && <div className="notice" role="alert">{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice("")}>×</button></div>}
          {confirmDelete && (() => { const target = jobs.find((item) => item.id === confirmDelete.id); return target ? <div className="job-details-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !confirmDelete.busy) setConfirmDelete(null); }}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
            <h2 id="confirm-delete-title">Move this job to Trash?</h2>
            <dl><div><dt>Job ID</dt><dd>{target.jobNumber}</dd></div><div><dt>Client</dt><dd>{target.clientName}</dd></div></dl>
            <ul><li>The job leaves every list, queue and count.</li><li>Samples, workbooks, reports, signatures and history are kept unchanged.</li><li>{getShare(target.id)?.enabled ? "Its shared client link is paused and returns on restore." : "It can be restored from Jobs → Trash."}</li></ul>
            {confirmDelete.error && <p className="confirm-error" role="alert">{confirmDelete.error}</p>}
            <footer><button type="button" className="outline-button" disabled={confirmDelete.busy} onClick={() => setConfirmDelete(null)}>Cancel</button><button type="button" className="danger-button" disabled={confirmDelete.busy} onClick={async () => { setConfirmDelete({ id: target.id, busy: true }); try { await moveJobToTrash(target.id); setConfirmDelete(null); setSelectedJobDetailsId(""); setNotice(`${target.jobNumber} moved to Trash. Restore it from Jobs → Trash.`); } catch (error) { setConfirmDelete({ id: target.id, error: error instanceof Error ? error.message : "Could not delete the job." }); } }}>{confirmDelete.busy ? "Moving…" : "Move to Trash"}</button></footer>
          </section></div> : null; })()}
          {!canView(workspaceView) ? <section className="panel authorization-panel"><h1>Access restricted</h1><p>Ask Mohammed Al Awaisi to enable access in Settings → Authorization.</p><button className="primary-button" type="button" onClick={() => setWorkspaceView("my-work")}>Back to My work</button></section> : workspaceView === "workflow" ? (workflowJob ? (!canOpen(workflowJob) ? <section className="panel authorization-panel" role="alert"><h1>No access to this job</h1><p>{noJobAccessMessage}</p><p>Jobs you work on are listed in My work. The Dashboard shows every active job without opening it.</p><div className="panel-actions"><button className="primary-button" type="button" onClick={() => setWorkspaceView("my-work")}>Go to My work</button><button className="outline-button" type="button" onClick={() => setWorkspaceView("dashboard")}>Dashboard</button></div></section> : !legacyView ? <OperationsWorkspace key={workflowJob.id+operationTab} reportContext={reportContext} job={workflowJob} actor={opsActor!} tab={operationTab==='handover'?'overview':operationTab} onNavigate={tab=>openOperation(workflowJob,tab)} onCommand={c=>runOperation(workflowJob.id,c)} onSampling={(target,sample)=>{const fresh=(JSON.parse(localStorage.getItem(jobsStorageKey)||'[]') as JobRecord[]).find(j=>j.id===workflowJob.id)||workflowJob;resumeJob(fresh);setStage((target||samplingStageFor(fresh)) as Stage);if(sample)setExpanded(sample);}} onSetup={()=>{resumeJob(workflowJob);setStage('job');}} onLegacy={()=>setLegacyView(true)} mine={{ actions: nowItems.filter((i) => i.jobId === workflowJob.id), upcoming: dashboardWork.upcoming.filter((u) => u.jobId === workflowJob.id), waiting: dashboardWork.waiting.filter((w) => w.jobId === workflowJob.id) }} back={({ "my-work": { label: "My work", href: "#my-work" }, sampling: { label: "Sampling", href: "#sampling" }, "pvt-lab": { label: "Laboratory", href: "#pvt-lab" } } as Record<string, { label: string; href: string }>)[returnTo] || { label: "Jobs", href: "#jobs" }} onOpenItem={(item) => openWorkItem(item)} /> : <JobWorkflow key={workflowJob.id} job={workflowJob} today={today} employeeName={employeeName} onBack={() => setWorkspaceView("jobs")} onOpenStage={(stageId) => stageId === "closed" ? resumeJob(workflowJob) : openStage(workflowJob, stageId)} />) : (() => { const binned = storedJobs.find((item) => item.id === workflowJobId && isTrashed(item)); return binned && opsActor && canSeeDraft(binned, opsActor) ? <section className="panel authorization-panel"><h1>This job is in Trash</h1><p>{binned.id} · {binned.clientName} was deleted by {employeeName(binned.trash?.deletedBy)} on {formatDateTime(binned.trash?.deletedAt)}. Its records are kept unchanged.</p>{hasPermission("deleteJobs") ? <button type="button" className="primary-button" onClick={() => { try { restoreJobFromTrash(binned.id); setNotice(`${binned.jobNumber} restored.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not restore the job."); } }}>Restore job</button> : <p>Ask an authorized person to restore it.</p>}</section> : <section className="panel"><h1>Job not found</h1><button type="button" onClick={() => setWorkspaceView("jobs")}>Back to jobs</button></section>; })()) : (workspaceView === "my-work" || workspaceView === "dashboard") && !hasPermission("jobDetails") ? (<section className="panel authorization-panel"><h1>Welcome, {currentEmployee.name.split(" ")[0]}</h1><p>Choose an authorized workspace from the menu. Contact Mohammed Al Awaisi to request additional access.</p></section>) : workspaceView === "dashboard" ? (
            <CompanyDashboard jobs={dashboardJobs} today={today} canActivity={canView("overview")} onActivity={() => setWorkspaceView("overview")} />
          ) : workspaceView === "my-work" ? (
            <MyWork now={nowItems} upcoming={[...dashboardWork.upcoming].sort((a, b) => (a.due || a.jobNumber).localeCompare(b.due || b.jobNumber))} waiting={dashboardWork.waiting} blocked={dashboardWork.blocked} blockedActions={dashboardWork.actions.filter(blockedAssign)} alerts={unseenAlerts} rows={inbox} today={today} name={employeeName} isNew={isNewItem} filter={myWorkFilter} onFilter={setMyWorkFilter} isAdmin={hasPermission("authorization")} canCreate={hasPermission("createJob")} onCreate={startNewJob} canPlan={canView("planning")} onPlanning={() => setWorkspaceView("planning")} flowOf={(id) => flowById.get(id)} onOpen={(item) => { setReturnTo("my-work"); openWorkItem(item); }} onReadAlert={(alert) => markSeen(alert.keys)} onOpenTab={(jobId, tab, alert) => { const target = jobs.find((job) => job.id === jobId); if (alert) markSeen(alert.keys); setReturnTo("my-work"); if (target) openOperation(target, tab); }} onOpenJob={(row) => { const target = jobs.find((job) => job.id === row.jobId); setReturnTo("my-work"); if (target) openOperation(target); }}>
            {storedJobs.length===0&&<section className="panel ops-panel demo-banner"><div><h2>Explore the workflow with demo jobs</h2><p>This browser has no jobs yet. Load six example jobs (sampling, review, PVT-only, Chemistry-only and mixed laboratory scope, and a completed job with Validation added later). All names and values are fictional and marked DEMO and stay in this browser. The demo switches on a labelled demo setup (teams, QC and receipt) that is stored separately and never written to Settings.</p></div><button type="button" className="primary-button" disabled={demoLoading} onClick={() => void loadDemoData()}>{demoLoading ? "Loading…" : "Load demo data"}</button></section>}</MyWork>
          ) : workspaceView === "planning" ? (
            <div className="secondary-view"><button type="button" className="text-button" onClick={() => setWorkspaceView("my-work")}>← My work</button>
            <WeeklyWork jobs={visibleJobs} actor={opsActor!} onOpen={openOperation} hidePending />
            <LabSummary onOpen={() => setWorkspaceView("pvt-lab")} rows={(["PVT", "Chemical"] as const).filter((stream) => hasPermission("analysis") && (currentEmployee.id === "MA001" || roleHolder(responsibilities, "pvtSupervisor", demoEmployees) === currentEmployee.id || roleHolder(responsibilities, streamLead(stream), demoEmployees) === currentEmployee.id)).map((stream) => ({ stream, counts: labStatuses.map((label) => [label, labItemsVisible.filter((item) => item.a.stream === stream && labStatus(item.a) === label).length] as [string, number]) }))} /></div>
          ) : workspaceView === "overview" ? (
            <div className="secondary-view"><button type="button" className="text-button" onClick={() => setWorkspaceView("dashboard")}>← Dashboard</button>
              <section className="page-head"><div><span className="eyebrow">COMPANY OVERVIEW</span><h1>Activity log</h1><p>Recent recorded actions across all jobs. Job progress is on the Dashboard; personal actions stay in My work.</p></div></section>
              <section className="panel ops-panel overview-activity"><h2>Activity history</h2>{activities.length ? <ul>{activities.slice(0, 50).map((item) => <li key={item.id}><span className="activity-avatar">{demoEmployees.find((employee) => employee.id === item.employeeId)?.initials}</span><div><strong>{employeeName(item.employeeId)}</strong> {item.action}<small>{item.jobId} · {formatDateTime(item.timestamp)}</small></div></li>)}</ul> : <p>No activity yet.</p>}</section>
              {currentEmployee.id === "MA001" && <details className="panel ops-panel"><summary>Administrator · workflow clarification review</summary><ClarificationReview /></details>}
            </div>
          ) : workspaceView === "jobs" ? (
            <>
              <section className="page-intro operations-page-intro"><div><span className="eyebrow">{canCompany ? "JOBS · MASTER REGISTER" : "JOBS · MY JOBS"}</span><h1>Jobs</h1><p>{canCompany ? "Your jobs, and every job company-wide." : "Jobs where you hold a responsibility."}</p></div>{hasPermission("createJob") && <button type="button" className="primary-button create-job-button" onClick={startNewJob}><Plus size={16} /> Create Job</button>}</section>
              <section className="operations-page-metrics"><article><span><Bell size={18} /></span><div><small>NEEDS MY ACTION</small><strong>{registerCounts.mine}</strong><em>Waiting for you</em></div></article><article><span><Gauge size={18} /></span><div><small>MY JOBS</small><strong>{registerCounts.myjobs}</strong><em>Jobs with your responsibility</em></div></article>{canCompany && <article><span><ShieldCheck size={18} /></span><div><small>ACTIVE · ALL</small><strong>{registerCounts.active}</strong><em>Company-wide, in progress</em></div></article>}<article><span><TriangleAlert size={18} /></span><div><small>MY OVERDUE TASKS</small><strong>{nowItems.filter((i) => i.overdue).length}</strong><em>Past their task deadline</em></div></article></section>
              <section className="panel operations-register jobs-register"><div className="panel-heading premium-heading"><div><span className="eyebrow">JOB CONTROL</span><h2>Job register</h2><p>Search, filter, and open a job or its next action.</p></div><span className="event-count">{jobsRegisterFilter === "trash" ? trashedJobs.length : filteredJobsRegister.length} SHOWN</span></div>
                <div className="jobs-register-tools"><div className="cockpit-filters" role="group" aria-label="Job filters">{([["mine", "Needs my action"], ["myjobs", "My jobs"], ...(canCompany ? [["active", "Active"]] : []), ...(hasPermission("createJob") || registerCounts.drafts ? [["drafts", "Drafts"]] : []), ...(canCompany ? [["completed", "Completed"], ["all", "All jobs"]] : []), ...(hasPermission("deleteJobs") ? [["trash", "Trash"]] : [])] as [typeof jobsRegisterFilter, string][]).map(([id, label]) => <button key={id} className={registerFilter === id ? "active" : ""} aria-pressed={registerFilter === id} type="button" onClick={() => setJobsRegisterFilter(id)}>{label} <span className="filter-count">{registerCounts[id]}</span></button>)}</div><label className="register-stage-filter"><span>STAGE</span><select value={jobsRegisterStage} onChange={(event) => setJobsRegisterStage(event.target.value)} aria-label="Filter by current stage"><option value="">All stages</option>{registerStages.map((label) => <option key={label}>{label}</option>)}</select></label><label className="cockpit-search jobs-id-search"><Search size={16} /><span>SEARCH</span><input value={jobsRegisterSearch} onChange={(event) => setJobsRegisterSearch(event.target.value)} placeholder="Job ID, client, field, well or person" aria-label="Search by Job ID or job details" /></label></div>
                {jobsRegisterFilter === "trash" ? <div className="operations-table-wrap"><table className="operations-table jobs-register-table trash-table"><thead><tr><th>Job ID</th><th>Client · Field / Well</th><th>Stage when deleted</th><th>Deleted by</th><th>Deleted</th><th aria-label="Action" /></tr></thead><tbody>{trashedJobs.filter((item) => { const term = jobsRegisterSearch.trim().toLowerCase(); return !term || [item.id, item.clientName, item.fieldArea, item.well].some((value) => value?.toLowerCase().includes(term)); }).map((item) => <tr key={item.id}><td><strong>{item.jobNumber}</strong><small>Created {reportDate(item.createdAt)}</small></td><td><strong>{item.clientName}</strong><small>{[item.fieldArea, item.well].filter(Boolean).join(" · ") || "Location not recorded"}</small></td><td><span className="stage-chip">{registerStage(item)}</span></td><td><strong>{employeeName(item.trash?.deletedBy)}</strong></td><td>{formatDateTime(item.trash?.deletedAt)}</td><td><button type="button" className="outline-button register-action" onClick={() => { try { restoreJobFromTrash(item.id); setNotice(`${item.jobNumber} restored. It is back in its lists with all samples, workbooks, reports and history.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not restore the job."); } }}>Restore</button></td></tr>)}{trashedJobs.length === 0 && <tr className="operations-empty-row"><td colSpan={6}><BriefcaseBusiness size={22} /><strong>Trash is empty.</strong><span>Deleted jobs appear here and can be restored.</span></td></tr>}</tbody></table></div> : <div className="operations-table-wrap"><table className="operations-table jobs-register-table"><thead><tr><th>Job ID</th><th>Client · Field / Well</th><th>Current stage</th><th>Your responsibility</th><th>Status · Job due</th><th aria-label="Action" /></tr></thead><tbody>{filteredJobsRegister.map((item) => { const actions = nowItems.filter((i) => i.jobId === item.id); const draft = isDraft(item); const next = actions[0]; const mine = inbox.find((r) => r.jobId === item.id); const actionLabel = draft ? (hasPermission("createJob") ? "Continue draft" : "View draft") : next ? next.button : "Open job"; return <tr key={item.id} className={actions.length ? "needs-action" : undefined}><td><button type="button" className="table-job-link" onClick={() => setSelectedJobDetailsId(item.id)}>{item.jobNumber}</button><small>Created {reportDate(item.createdAt)}</small></td><td><strong>{item.clientName}</strong><small>{[item.fieldArea, item.wellMode === "multiple" ? (item.wells || []).filter(Boolean).join(", ") : item.well].filter(Boolean).join(" · ") || "Location not recorded"}</small></td><td><span className="stage-chip">{registerStage(item)}</span><small>{draft ? "Not sent to Sampling" : next ? next.action : flowOf(item).now[0]?.text || flowOf(item).next}</small></td><td><strong>{draft ? "Job creation" : mine?.roles.join(" · ") || "—"}</strong>{actions.length > 0 && <small className="your-action">Your action{actions.length > 1 ? `s (${actions.length})` : ""}</small>}</td><td><div className="badge-stack"><StatusBadge state={flowOf(item).state} label={flowOf(item).status} correction={flowOf(item).correction} size="sm" />{isOverdue(item) && !draft && <OverdueBadge due={item.dueDate} today={today} size="sm" />}</div><small className={isOverdue(item) && !draft ? "overdue-text" : ""}>Due {item.dueDate ? reportDate(item.dueDate) : "not set"}</small></td><td><button type="button" className={actions.length ? "attention-button register-action" : draft && hasPermission("createJob") ? "draft-button register-action" : "continue-button"} onClick={() => { setReturnTo("jobs"); if (draft) { if (hasPermission("createJob")) resumeJob(item); else openOperation(item); } else if (next) openWorkItem(next); else openOperation(item, "overview"); }}>{actionLabel} <ChevronRight size={14} /></button>{hasPermission("deleteJobs") && <button type="button" className="text-button register-delete" onClick={() => setConfirmDelete({ id: item.id })}>Delete job</button>}</td></tr>; })}{filteredJobsRegister.length === 0 && <tr className="operations-empty-row"><td colSpan={6}><BriefcaseBusiness size={22} /><strong>{visibleJobs.length ? "No jobs match this view." : "No jobs yet."}</strong><span>{visibleJobs.length ? "Try another filter, stage or search." : hasPermission("createJob") ? "Choose Create Job to register the first job." : "Jobs assigned to you will appear here."}</span></td></tr>}</tbody></table></div>}
              </section>
              {selectedJobDetails && <div className="job-details-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSelectedJobDetailsId(""); }} role="presentation"><aside className="job-details-drawer" aria-label={`Job details for ${selectedJobDetails.jobNumber}`}>
                <header><div><span className="eyebrow">COMPLETE JOB RECORD</span><h2>{selectedJobDetails.jobNumber}</h2><p>{selectedJobDetails.clientName} · {prog(selectedJobDetails).current?.label || "Closed"}</p></div><button type="button" onClick={() => setSelectedJobDetailsId("")} aria-label="Close job details">×</button></header>
                <div className="job-details-scroll"><button type="button" className="primary-button" onClick={() => { setWorkflowJobId(selectedJobDetails.id); setSelectedJobDetailsId(""); setWorkspaceView("workflow"); }}>View job workflow</button>
                  <section className="job-details-section"><h3>Sampling scope &amp; instructions</h3><p><strong>Samples requested:</strong> {selectedJobDetails.requestedSampleCount || "Not recorded"}</p><p className="instructions-text"><strong>Sampling instructions:</strong> {selectedJobDetails.samplingInstructions || "Not recorded"}</p>{(selectedJobDetails.requiredTests || []).length > 0 && <p><strong>Initial laboratory request (reference only):</strong> {(selectedJobDetails.requiredTests || []).map((test) => test === "Other" ? selectedJobDetails.otherTests : test).join(" · ")}</p>}{selectedJobDetails.sampleCountNotes && <p>{selectedJobDetails.sampleCountNotes}</p>}</section>
                  <section className="job-details-status"><div><small>STATUS</small><StatusBadge state={flowOf(selectedJobDetails).state} label={flowOf(selectedJobDetails).status} correction={flowOf(selectedJobDetails).correction} size="sm" />{isOverdue(selectedJobDetails) && <OverdueBadge due={selectedJobDetails.dueDate} today={today} size="sm" />}</div><div><small>PROGRESS</small><strong>{flowOf(selectedJobDetails).done} of {flowOf(selectedJobDetails).total} steps</strong><MiniTracker flow={flowOf(selectedJobDetails)} /></div><div><small>NEXT</small><strong>{flowOf(selectedJobDetails).now[0]?.text || flowOf(selectedJobDetails).next}</strong></div></section>
                  <section className="job-details-section"><h3>Job Information</h3><div className="job-details-grid"><div><small>CLIENT</small><strong>{selectedJobDetails.clientName}</strong></div><div><small>COUNTRY</small><strong>{jobCountries.find((country) => country.code === (selectedJobDetails.countryCode || selectedJobDetails.id.split("-")[0]))?.name || selectedJobDetails.countryCode || "Not specified"}</strong></div><div><small>DATE RECEIVED</small><strong>{reportDate(selectedJobDetails.dateReceived)}</strong></div><div><small>FIELD</small><strong>{selectedJobDetails.fieldArea || "Not specified"}</strong></div><div><small>WELL</small><strong>{selectedJobDetails.wellMode === "multiple" ? (selectedJobDetails.wells || []).filter(Boolean).join(", ") || "Not specified" : selectedJobDetails.well || "Not specified"}</strong></div><div><small>INSTALLATION / RIG</small><strong>{selectedJobDetails.rigInstallation || "Not specified"}</strong></div><div><small>DUE DATE</small><strong>{reportDate(selectedJobDetails.dueDate)}</strong></div><div><small>CLIENT FOCAL POINT</small><strong>{selectedJobDetails.clientFocalPoint || "Not specified"}</strong></div><div><small>FOCAL POINT CONTACT</small><strong>{selectedJobDetails.clientFocalPointContact || "Not specified"}</strong></div><div><small>FOCAL POINT EMAIL</small><strong>{selectedJobDetails.clientFocalPointEmail || selectedJobDetails.clientReference || "Not specified"}</strong></div></div><div className="job-details-description"><small>JOB / REQUEST DESCRIPTION</small><p>{selectedJobDetails.description || "Not specified"}</p></div></section>
                  <section className="job-details-section"><h3>Responsibility &amp; Tracking</h3><div className="job-details-grid"><div><small>JOB RESPONSIBLE PERSON</small><strong>{employeeName(selectedJobDetails.jobResponsibleId || selectedJobDetails.responsibleId)}</strong></div><div><small>JOB OWNER</small><strong>{employeeName(selectedJobDetails.ownerId)}</strong></div><div><small>ASSIGNED ENGINEER</small><strong>{employeeName(selectedJobDetails.assignedEngineerId || selectedJobDetails.responsibleId)}</strong></div><div><small>ASSIGNED DRIVER</small><strong>{employeeName(selectedJobDetails.assignedDriverId)}</strong></div><div><small>CREATED BY</small><strong>{employeeName(selectedJobDetails.createdById)}</strong></div><div><small>CREATED</small><strong>{formatDateTime(selectedJobDetails.createdAt)}</strong></div><div><small>LAST UPDATED BY</small><strong>{employeeName(selectedJobDetails.lastUpdatedById)}</strong></div><div><small>LAST UPDATED</small><strong>{formatDateTime(selectedJobDetails.lastUpdatedAt)}</strong></div></div></section>
                  <section className="job-details-section"><h3>Sampling &amp; Report</h3><div className="job-details-grid"><div><small>SAMPLING TYPE</small><strong>{selectedJobDetails.samplingSource === "Other" && selectedJobDetails.otherSamplingType ? `Other — ${selectedJobDetails.otherSamplingType}` : selectedJobDetails.samplingSource || "Not selected"}</strong></div><div><small>FIELD SAMPLING</small><strong>{selectedJobDetails.samplingRequired === undefined ? "Not decided" : selectedJobDetails.samplingRequired ? "Required" : "Not required"}</strong></div><div><small>SAMPLE RECORDS</small><strong>{selectedJobDetails.samples?.length || 0}</strong></div><div><small>DATA SHEETS COMPLETE</small><strong>{selectedJobDetails.samples?.filter((sample) => sample.dataComplete).length || 0} / {selectedJobDetails.samples?.length || 0}</strong></div><div><small>REPORT STATUS</small><strong>{selectedJobDetails.report?.reportStatus || "Not started"}</strong></div><div><small>SEQUENCE EVENTS</small><strong>{selectedJobDetails.events?.length || 0}</strong></div>{selectedJobDetails.report && <><div><small>REPORT PREPARED BY</small><strong>{employeeName(selectedJobDetails.report.preparedBy)}</strong></div><div><small>REPORT APPROVER</small><strong>{employeeName(selectedJobDetails.report.approvedBy)}</strong></div><div><small>APPROVAL DATE</small><strong>{reportDate(selectedJobDetails.report.approvalDate)}</strong></div></>}</div>
                    {(selectedJobDetails.samples?.length || 0) > 0 && <div className="job-details-table"><table><thead><tr><th>Sample</th><th>Sampler</th><th>Cylinder / Container</th><th>Data Sheet</th></tr></thead><tbody>{selectedJobDetails.samples?.map((sample) => <tr key={sample.id}><td><strong>{sample.id}</strong></td><td>{sample.sampler || "Not specified"}{sample.samplerSerial ? ` · ${sample.samplerSerial}` : ""}</td><td>{containerLabel(sample, "Not specified")}</td><td><span className={`data-sheet-pill ${sample.dataComplete ? "complete" : "not-started"}`}>{sample.dataComplete ? "Complete" : "Not complete"}</span></td></tr>)}</tbody></table></div>}
                  </section>
                  <section className="job-details-section"><h3>Pre-job Coordination</h3><div className="job-details-grid"><div><small>CHECKLIST PROGRESS</small><strong>{selectedJobDetails.coordinationTasks?.filter((task) => task.completed).length || 0} / {selectedJobDetails.coordinationTasks?.length || 0}</strong></div><div><small>TOOLS REQUIREMENT</small><strong>{selectedJobDetails.coordinationDetails?.toolsRequired || "Not Confirmed"}</strong></div><div><small>TOOLS AVAILABILITY</small><strong>{selectedJobDetails.coordinationDetails?.toolsAvailability || "Not Confirmed"}</strong></div><div><small>TOOLS CONFIRMED BY</small><strong>{selectedJobDetails.coordinationDetails?.toolsConfirmedBy ? employeeName(selectedJobDetails.coordinationDetails.toolsConfirmedBy) : "Not Confirmed"}</strong></div><div><small>CONFIRMATION DATE</small><strong>{selectedJobDetails.coordinationDetails?.toolsConfirmedAt ? formatDateTime(selectedJobDetails.coordinationDetails.toolsConfirmedAt) : "Not Confirmed"}</strong></div></div>{selectedJobDetails.coordinationTasks?.length ? <div className="job-details-workflow coordination-drawer-list">{selectedJobDetails.coordinationTasks.map((task) => <article key={task.id}><span className={task.completed ? "completed" : "not-started"}>{task.completed ? "✓" : "•"}</span><div><strong>{task.label}</strong><small>{task.completed ? `Completed by ${employeeName(task.completedBy)}` : "Pending sampling team action"}</small></div><div><em>{task.completed ? "Completed" : "Pending"}</em><small>{task.completed ? formatDateTime(task.completedAt) : "Not completed"}</small></div></article>)}</div> : <p className="job-details-empty">No pre-job checklist is recorded for this job.</p>}</section>
                  <details className="job-details-section events-fold"><summary>Sequence of Events <span>{selectedJobDetails.events?.length || 0}</span><em>Show</em></summary>{selectedJobDetails.events?.length ? <div className="job-details-events">{[...selectedJobDetails.events].sort((a, b) => `${b.date || ""}T${b.time || ""}`.localeCompare(`${a.date || ""}T${a.time || ""}`)).map((item, index) => <article key={item.createdAt || `${item.date}-${item.time}-${index}`}><time>{reportDate(item.date)} · {item.time || "No time"}</time><strong>{item.description}</strong><small>{employeeName(item.createdBy)}</small></article>)}</div> : <p className="job-details-empty">No sequence-of-events entries recorded yet.</p>}</details>
                  <section className="job-details-section"><h3>Sampling Workflow Stages</h3><div className="job-details-workflow">{selectedJobDetails.stages.map((workflow) => <article key={workflow.name}><span className={workflow.status.toLowerCase().replace(" ", "-")}>{workflow.status === "Completed" ? "✓" : workflow.status === "Skipped" ? "—" : "•"}</span><div><strong>{workflow.name}</strong><small>Assigned to {employeeName(workflow.assignedTo)}</small></div><div><em>{workflow.status}</em><small>{workflow.completed ? `Completed ${formatDateTime(workflow.completed)}` : workflow.started ? `Started ${formatDateTime(workflow.started)}` : "Not started"}</small></div></article>)}</div></section>
                </div>
                <footer>{hasPermission("deleteJobs") && <button type="button" className="text-button register-delete" onClick={() => setConfirmDelete({ id: selectedJobDetails.id })}>Delete job</button>}<button type="button" className="outline-button" onClick={() => setSelectedJobDetailsId("")}>Close</button><button type="button" className="primary-button" onClick={() => { setSelectedJobDetailsId(""); openStage(selectedJobDetails); }}>Continue Workflow <ChevronRight size={15} /></button></footer>
              </aside></div>}
            </>
          ) : workspaceView === "sampling" ? (
            <>
              <section className="page-intro operations-page-intro"><div><span className="eyebrow">SAMPLING · OPERATIONS CONTROL</span><h1>Sampling</h1><p>Sampling activities and their sampling reports, kept on the same job record from preparation to approval.</p></div></section>
              <div className="sampling-tabs" role="tablist" aria-label="Sampling sections"><button type="button" role="tab" aria-selected={samplingTab === "jobs"} className={samplingTab === "jobs" ? "active" : ""} onClick={() => setSamplingTab("jobs")}><FlaskConical size={16} aria-hidden="true" />My sampling work<span>{mySamplingWork.length}</span></button><button type="button" role="tab" aria-selected={samplingTab === "reports"} className={samplingTab === "reports" ? "active" : ""} onClick={() => setSamplingTab("reports")}><FileText size={16} aria-hidden="true" />Sampling Reports<span>{reportsWorkspaceJobs.length}</span></button><button type="button" role="tab" aria-selected={samplingTab === "cylinders"} className={samplingTab === "cylinders" ? "active" : ""} onClick={() => setSamplingTab("cylinders")}><PackageSearch size={16} aria-hidden="true" />Cylinders<span>{bottleInventory.filter((c) => { const st = cylStatus(c.serial).state; return st === "returned" || st === "not-checked"; }).length}</span></button></div>
              {samplingTab === "cylinders" ? <CylinderRegister cylinders={bottleInventory} status={cylStatus} records={cylinderRecords} canEdit={hasPermission("inventory") && hasPermission("sampling")} me={currentEmployee.id} name={employeeName} onSave={saveCylinderRecords} onOpenJob={(id) => { const j = jobs.find((x) => x.id === id); if (j) openOperation(j); }} /> : samplingTab === "jobs" ? <>
              {(() => {
                const row = (item: JobRecord, mine: boolean) => { const status = samplingStatus(item, responsibilities); const team = samplingTeam(item); const unseen = mine ? unseenEvents(item) : []; const sent = item.operations?.dispatchedAt; return <tr key={item.id} className={mine && status.owner === currentEmployee.id ? "needs-action" : undefined}><td><button type="button" className="table-job-link" onClick={() => openSamplingTask(item)}>{item.jobNumber}</button><small>{item.clientName}</small>{unseen.some((key) => key.startsWith("assign:")) && <span className="status-pill new-pill">New assignment</span>}{unseen.some((key) => key.startsWith("return:")) && <span className="status-pill returned-pill">Returned</span>}{unseen.some((key) => key.startsWith("review:") || key.startsWith("report:")) && <span className="status-pill new-pill">New for review</span>}</td><td><strong>{item.fieldArea || "Field not recorded"}</strong><small>{item.wellMode === "multiple" ? (item.wells || []).filter(Boolean).join(", ") : item.well || "Well not recorded"}</small></td><td><strong>{item.samplingSource === "Other" && item.otherSamplingType ? `Other — ${item.otherSamplingType}` : item.samplingSource}</strong></td><td><strong>{employeeName(team[0])}</strong><small>{team.length > 1 ? "Supporting: " + team.slice(1).map(employeeName).join(", ") : "No supporting employees"}</small></td><td><small>Sent {sent ? reportDate(sent) : "not recorded"}</small><small className={isOverdue(item) ? "overdue-text" : ""}>Due {item.dueDate ? reportDate(item.dueDate) : "not set"}</small></td><td><span className={`status-pill ${status.key === "returned" ? "returned-pill" : status.key === "report-approved" ? "flow-closed" : "flow-active"}`}>{status.label}</span><small>Next: {status.next}{status.owner ? ` · ${employeeName(status.owner)}` : ""}</small></td><td><button type="button" className={mine && (status.owner === currentEmployee.id || (status.team && team.includes(currentEmployee.id))) ? "primary-button register-action" : "continue-button"} onClick={() => openSamplingTask(item)}>{samplingActionLabel(item)} <ChevronRight size={14} /></button></td></tr>; };
                const head = <thead><tr><th>Job</th><th>Field / Well</th><th>Sampling type</th><th>Assigned</th><th>Dates</th><th>Status · next action</th><th aria-label="Action" /></tr></thead>;
                return <>
                  <section className="panel operations-register sampling-queue"><div className="panel-heading premium-heading"><div><span className="eyebrow">MY ASSIGNED WORK</span><h2>My sampling work</h2><p>Sampling jobs where you have a task, a review or an approval. The same tasks appear in My work.</p></div><span className="event-count">{mySamplingWork.length} JOBS</span></div>
                    <div className="operations-table-wrap"><table className="operations-table sampling-queue-table">{head}<tbody>{mySamplingWork.map((item) => row(item, true))}{mySamplingWork.length === 0 && <tr className="operations-empty-row"><td colSpan={7}><FlaskConical size={22} /><strong>No sampling work assigned to you.</strong><span>Jobs sent to you appear here with their instructions.</span></td></tr>}</tbody></table></div>
                  </section>
                  {canCompany && <details className="panel operations-register team-overview" open={mySamplingWork.length === 0}><summary><span className="eyebrow">TEAM OVERVIEW</span><strong>All sampling jobs ({samplingOverview.length})</strong><small>Read-only overview for authorized users. Drafts are not shown.</small></summary>
                    <div className="operations-table-wrap"><table className="operations-table sampling-queue-table">{head}<tbody>{samplingOverview.map((item) => row(item, false))}{samplingOverview.length === 0 && <tr className="operations-empty-row"><td colSpan={7}><strong>No sampling jobs yet.</strong><span>{hasPermission("createJob") ? "Jobs appear here after you send them to Sampling." : "Jobs sent to Sampling will appear here."}</span></td></tr>}</tbody></table></div>
                  </details>}
                </>;
              })()}
              </> : <>

              <section className="panel operations-register"><div className="panel-heading premium-heading"><div><span className="eyebrow">REPORT REGISTER</span><h2>Sampling reports</h2><p>Drafts, checking, approval and approved sampling reports stay linked to their job. Each stays linked to its job and sample records — click a job ID to see its full workflow.</p></div><span className="event-count">{reportsWorkspaceJobs.length} REPORTS</span></div>
                <div className="operations-table-wrap"><table className="operations-table reports-register-table"><thead><tr><th>Report / Job</th><th>Client</th><th>Field / Well</th><th>Prepared By</th><th>Prepared Date</th><th>Approval Status</th><th>Last Updated</th><th /></tr></thead><tbody>{reportsWorkspaceJobs.map((item) => { const modernReport=latest(item.operations?.samplingReports||[]); const reportStatus = modernReport?.status || item.report?.reportStatus || "Draft"; return <tr key={item.id}><td><button type="button" className="table-job-link" onClick={() => { setWorkflowJobId(item.id); setWorkspaceView("workflow"); }}>{item.jobNumber}</button><small>Sampling report · {item.samples?.filter((sample) => sample.dataComplete).length || 0}/{item.samples?.length || 0} sample sheets</small></td><td><strong>{item.clientName}</strong></td><td><strong>{item.fieldArea || "Not specified"}</strong><small>{item.well || "Well not specified"}</small></td><td><strong>{employeeName(modernReport?.preparedBy||item.report?.preparedBy)}</strong></td><td><span>{modernReport?.preparedAt ? reportDate(modernReport.preparedAt) : item.report?.preparedDate ? reportDate(item.report.preparedDate) : "Not recorded"}</span></td><td><span className={`report-status-pill ${reportStatus.toLowerCase().replaceAll(" ", "-")}`}>{reportStatus}</span></td><td><span>{formatDateTime(item.lastUpdatedAt)}</span></td><td><button type="button" className="continue-button" onClick={() => { if(item.operations){openOperation(item,"sampling-report");return;} resumeJob(item); setStage(reportStatus === "Completed" ? "scope" : "report"); }}>Open Report <ChevronRight size={14} /></button></td></tr>; })}{reportsWorkspaceJobs.length === 0 && <tr className="operations-empty-row"><td colSpan={8}><FileText size={22} /><strong>No reports available yet.</strong><span>Drafts, checking, approval and approved sampling reports stay linked to their job.</span></td></tr>}</tbody></table></div>
              </section>
              </>}
            </>
) : workspaceView === "pvt-lab" ? (
            <><LabWorkspace jobs={visibleJobs.filter((item) => !isDraft(item))} actor={opsActor!} work={dashboardWork} isNew={isNewItem} onOpenItem={(item) => { setReturnTo("pvt-lab"); openWorkItem(item); }} onOpen={(item) => { markSeen(labEvents(item)); setReturnTo("pvt-lab"); openOperation(item.job, "laboratory?activity=" + encodeURIComponent(item.a.id)); }} />
              {(currentEmployee.id === "MA001" || (["scopeSelector", "pvtSupervisor", "pvtTeamLead", "chemicalTeamLead"] as const).some((key) => roleHolder(responsibilities, key, demoEmployees) === currentEmployee.id)) && <WeeklyWork jobs={visibleJobs} actor={opsActor!} onOpen={(job, tab) => { setReturnTo("pvt-lab"); openOperation(job, tab); }} teamView hidePending />}
              {currentEmployee.id === "MA001" && jobs.some((item) => !item.operations && !isDraft(item) && (item.requiredTests || []).length > 0) && <details className="panel ops-panel legacy-records"><summary>Historical laboratory records (read-only · earlier workflow)</summary><p className="filter-note">Jobs recorded before the current laboratory workflow. Shown for reference only; nothing here can be changed. Current jobs are not listed.</p><PvtLab key={labJobId || "lab-list"} initialJobId={labJobId} jobs={jobs.filter((item) => !item.operations && !isDraft(item))} today={today} employeeName={employeeName} team={[]}
                canPlan={() => false} lockReason={() => "Historical record — read only."}
                onOpenJob={(item) => { setWorkflowJobId(item.id); setWorkspaceView("workflow"); }} onEditScope={() => undefined}
                onSavePlan={() => setNotice("Historical records are read-only.")} onUpdateTest={() => setNotice("Historical records are read-only.")} /></details>}</>
          ) : workspaceView === "profile" ? (
            <>
              <section className="page-intro profile-intro"><div><span className="eyebrow">EMPLOYEE · MY PROFILE</span><h1>My Profile</h1><p>Your employee identity, current responsibilities and recent activity.</p></div></section>
              <section className="profile-hero panel"><div className="profile-avatar">{currentEmployee.initials}</div><div><h2>{currentEmployee.name}</h2><p>{currentEmployee.role}</p><span>{currentEmployee.id}</span></div><div className="profile-state"><span className="status-dot" /> Active employee</div></section>
              <section className="metric-grid profile-metrics"><article><span>MY JOBS</span><strong>{inbox.length}</strong><small>with a responsibility of yours</small></article><article><span>DO NOW</span><strong>{nowItems.length}</strong><small>tasks ready for you</small></article><article><span>COMING UP</span><strong>{dashboardWork.upcoming.length}</strong><small>not your turn yet</small></article><article><span>WAITING</span><strong>{dashboardWork.waiting.length}</strong><small>with others</small></article></section>
              <div className="profile-grid">
                <section className="panel"><div className="panel-heading"><span className="section-number">01</span><div><h2>My jobs</h2><p>Jobs where you hold a responsibility, and your part in each.</p></div></div><div className="profile-work-list">{inbox.map((row) => <article key={row.jobId}><div><strong>{row.jobNumber}</strong><span>{row.client}</span></div><div><span className="stage-chip">{row.stage}</span><small>{row.roles.join(" · ")}</small></div></article>)}{!inbox.length && <p>No jobs currently include a responsibility of yours.</p>}</div></section>
                <section className="panel"><div className="panel-heading"><span className="section-number">02</span><div><h2>Activity history</h2><p>Your recent recorded actions.</p></div></div><div className="profile-history">{myActivities.slice(0, 8).map((item) => <article key={item.id}><span className="timeline-dot" /><div><strong>{item.action}</strong><p>{item.jobId}</p><small>{formatDateTime(item.timestamp)}</small></div></article>)}</div></section>
              </div>
            </>
          ) : workspaceView === "inventory" ? (
            <>
              <section className="page-intro inventory-intro"><div><span className="eyebrow">INVENTORY · CYLINDERS</span><h1>Inventory</h1><p>Manage cylinder types, serial numbers and capacities.</p></div></section>
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
              {settingsPage==='employees' && hasPermission('employees') && <EmployeeSettings directory={directory} onSave={saveDirectory} jobs={storedJobs} onReview={item=>{setWorkflowJobId(item.id);setWorkspaceView('workflow');}} />}
              {settingsPage==='departments' && hasPermission('employees') && <OptionSettings directory={directory} onSave={saveDirectory} />}
              {settingsPage==='company' && hasPermission('company') && <CompanySettings company={company} onSave={next=>{if(!hasPermission('company')) throw Error('You cannot manage company details.'); localStorage.setItem('vaps-company-v1',JSON.stringify(next));setCompany(next);}} />}
              {settingsPage === "tests" && hasPermission("tests") && <TestCatalogueSettings key={JSON.stringify([customTests, savedRoutingRaw])} custom={customTests} saved={savedRoutingRaw} error={testRoutingError} demoActive={demoActive} onSave={(custom, routing) => {
                if (!hasPermission("tests") || testRoutingError) return false;
                try {
                  const validCustom = readCustomTests(JSON.stringify({ tests: custom.map(({ id, name, group, section }) => ({ id, name, group, section })) }));
                  const validRouting = readSavedRouting(JSON.stringify(routing), catalogueIds(validCustom));
                  window.localStorage.setItem(testCatalogueKey, JSON.stringify({ tests: validCustom.map(({ id, name, group, section }) => ({ id, name, group, section })) }));
                  window.localStorage.setItem(testRoutingKey, JSON.stringify(validRouting));
                  setCustomTests(validCustom); setSavedRoutingRaw(validRouting); setTestRouting(effectiveRouting(validRouting));
                  const added = validCustom.filter(t => !customTests.some(c => c.id === t.id)).map(t => t.name);
                  recordActivity("Updated test catalogue" + (added.length ? ": added " + added.join(", ") : ""), "Settings"); setNotice("Test catalogue saved."); return true;
                } catch { setNotice("Test catalogue could not be saved. Please try again."); return false; }
              }} />}
              {settingsPage === "authorization" && hasPermission("authorization") && <AuthorizationSettings key={JSON.stringify([authorization,savedResponsibilities,savedLabTeams])} teams={savedLabTeams} teamsError={labTeamsError} onSaveTeams={next => {
                if (!hasPermission("authorization") || labTeamsError) return false;
                try { const validated = readLabTeams(JSON.stringify(next), demoEmployees.map(person => person.id)); window.localStorage.setItem(labTeamsKey, JSON.stringify(validated)); setLabTeams(validated); recordActivity("Updated laboratory teams", "Settings"); setNotice("Laboratory teams saved."); return true; }
                catch { setNotice("Laboratory teams could not be saved. Please try again."); return false; }
              }} policy={authorization} roles={savedResponsibilities} rolesError={responsibilitiesError} employees={demoEmployees} departments={directory.departments} error={authorizationError} onSaveRoles={next => {
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
              <span className="eyebrow">{stage === "job" && !createdJobId ? "PVT OPERATIONS · NEW JOB" : stage === "job" ? "JOB SETUP · " + displayJobId : stage === "report" ? "SAMPLING REPORT · " + displayJobId : "SAMPLING · " + displayJobId}</span>
              <h1>{stageTitle}</h1>
              <p>{stageCopy}</p>
            </div>
            
          </section>

          {stage !== "job" && stage !== "type" && stage !== "bottomhole" && currentJob && <>
            <section className="responsibility-strip">
              <div><small>JOB OWNER</small><strong>{employeeName(currentJob.ownerId)}</strong><span>Created by {employeeName(currentJob.createdById)} · {formatDateTime(currentJob.createdAt)}</span></div>
              <label><small>CURRENT ASSIGNED ENGINEER</small><select disabled value={currentJob.assignedEngineerId || currentJob.responsibleId} onChange={(event) => reassignJob(event.target.value)}>{demoEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <div><small>CURRENT STAGE</small><strong>{currentJob.currentStage}</strong></div>
              <div><small>LAST UPDATED BY</small><strong>{employeeName(currentJob.lastUpdatedById)}</strong><span>{formatDateTime(currentJob.lastUpdatedAt)}</span></div>
            </section>
          </>}

          {(stage === "type" || stage === "bottomhole") && (() => {
            const plan = job.samplingPlan.length ? job.samplingPlan : legacyPlan({ ...(currentJob || {}), samplingSource: samplingType || undefined, requestedSampleCount: job.requestedSampleCount });
            const backups = job.samplingTeamIds.filter((id) => id !== job.assignedEngineerId);
            const wells = job.wellMode === "multiple" ? job.wells.filter(Boolean).join(", ") : job.well || job.wells[0];
            const box = (label: string, value: ReactNode, full = false) => <div className={full ? "full-field" : undefined}><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>;
            return <section className="panel prep-summary" aria-label="Job summary">
              <div className="prep-summary-head"><div><span className="eyebrow">JOB SUMMARY</span><h2>{displayJobId} · {clientName}</h2><p>Everything you need for this job in one place. {stage === "type" ? "Fill in the preparation below." : "Fill in the sampling data for each sample below."}</p></div>
                {currentJob && <button type="button" className="outline-button" onClick={() => { setWorkflowJobId(currentJob.id); setWorkspaceView("workflow"); }}>Open job page</button>}</div>
              <dl className="review-grid prep-summary-grid">
                {box("Field / well", [job.fieldArea, wells].filter(Boolean).join(" · "))}
                {box("Due date", ukDate(job.dueDate) || "Not recorded")}
                {locationDetails(job, samplingType).filter(([label]) => label !== "FIELD / AREA" && label !== "WELL").map(([label, value]) => <Fragment key={label}>{box(label.charAt(0) + label.slice(1).toLowerCase(), value)}</Fragment>)}
                <div className="prep-focal"><dt>Client focal point</dt><dd>{job.clientFocalPoint || job.clientFocalPointContact || job.clientFocalPointEmail ? <><strong>{job.clientFocalPoint || "Name not recorded"}</strong>{job.clientFocalPointContact && <a href={"tel:" + job.clientFocalPointContact.replace(/[^+\d]/g, "")}>📞 {job.clientFocalPointContact}</a>}{job.clientFocalPointEmail && <a href={"mailto:" + job.clientFocalPointEmail}>✉ {job.clientFocalPointEmail}</a>}</> : "Not recorded"}</dd></div>
                {box("Crew", <span className="crew-list">{job.assignedEngineerId && <span className="crew-person">{employeeName(job.assignedEngineerId)} <span className="crew-role accountable">Accountable</span></span>}{backups.map((id) => <span key={id} className="crew-person">{employeeName(id)} <span className="crew-role">Backup</span></span>)}{job.assignedDriverId && <span className="crew-person">{employeeName(job.assignedDriverId)} <span className="crew-role driver">Driver</span></span>}</span>)}
                {box("Sampling scope", <ul className="review-plan">{plan.map((row) => <li key={row.source}><strong>{sourceLabel(row.source)}</strong> · {rowSummary(row)}{row.note ? ` · ${row.note}` : ""}</li>)}</ul>, true)}
                <div className="full-field prep-instructions"><dt>Sampling instructions</dt><dd className="instructions-text">{job.samplingInstructions || "No specific sampling instructions recorded for this job."}</dd></div>
              </dl>
              <details className="briefing-details"><summary>More job details</summary><dl className="review-grid prep-summary-grid">
                {box("Job / request description", <span className="instructions-text">{job.description}</span>, true)}
                {box("Job date", ukDate(job.dateReceived))}
                {box("Created by", currentJob ? `${employeeName(currentJob.createdById)} · ${formatDateTime(currentJob.createdAt)}` : "")}
                {scopeAttachment && box("Client request document", <a href={scopeAttachment.dataUrl} download={scopeAttachment.name}>{scopeAttachment.name}</a>, true)}
              </dl></details>
            </section>;
          })()}


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

          {samplingFlow && (stage === "type" || stage === "bottomhole") && <section className="panel step-guide"><div><span className="eyebrow">STEP {stage === "type" ? 1 : 2} OF 4</span><h2>{stage === "type" ? (transferFlow ? "Transfer preparation" : "Preparation") : (transferFlow ? "Sample transfer data" : "Sample records & sampling data")}</h2><p>{stage === "type" ? "Complete the coordination checklist and prepare the equipment and container for each sample. Glass bottles and IATA cans need only their volume." : "Fill the standard data sheet for every sample and mark each one complete. Use N/A only where a condition does not apply."}</p><p className="required-legend"><strong>Required:</strong> fields marked * · <strong>Optional:</strong> remarks and notes · Your entries are kept when you move between steps; use Save Draft to store them.</p></div><div className="step-guide-status"><small>STATUS</small><strong>{currentSamplingStatus!.label}</strong><span>Next: {currentSamplingStatus!.next}</span>{samplingDataLocked(currentJob!) ? <button type="button" className="outline-button" onClick={() => setStage("report")}>View submission</button> : stage === "type" ? <button type="button" className="outline-button" onClick={() => setStage("bottomhole")}>Continue to sample data →</button> : <button type="button" className="outline-button" onClick={() => setStage("report")}>Continue to review &amp; submit →</button>}</div></section>}


          {stage !== "job" && stage !== "type" && stage !== "bottomhole" && currentJob && <details className="workflow-details"><summary><span>Workflow responsibility</span><strong>{currentJob.currentStage} · {currentJob.stages.filter((item) => item.status === "Completed" || item.status === "Skipped").length} of {workflowStageNames.length} stages resolved</strong><i>⌄</i></summary><section className="stage-tracking" aria-label="Workflow responsibility">{currentJob.stages.map((item) => <article key={item.name} className={item.status.toLowerCase().replace(" ", "-")}><div><span>{item.status === "Completed" ? "✓" : item.status === "Skipped" ? "—" : "•"}</span><strong>{item.name}</strong></div><dl><div><dt>Assigned to</dt><dd>{employeeName(item.assignedTo)}</dd></div><div><dt>Status</dt><dd>{item.status}</dd></div><div><dt>Started</dt><dd>{formatDateTime(item.started)}</dd></div><div><dt>Completed</dt><dd>{formatDateTime(item.completed)}</dd></div><div><dt>Last updated by</dt><dd>{employeeName(item.lastUpdatedBy)}</dd></div></dl></article>)}</section></details>}

          {stage !== "job" && stage !== "type" && stage !== "bottomhole" && <section className="panel scope-plan-summary"><h2>Sampling scope</h2><p><strong>Sampling:</strong> {samplingTypeLabel || "Not selected"} · <strong>Samples requested:</strong> {job.requestedSampleCount || "Not specified"}</p>{job.sampleCountNotes && <p>{job.sampleCountNotes}</p>}</section>}
          {stage !== "job" && stage !== "type" && stage !== "bottomhole" && <section className="panel instructions-panel"><div className="panel-heading"><div><h2>Sampling instructions</h2><p>From {employeeName(currentJob?.createdById)} · Assigned: {[job.assignedEngineerId, ...job.samplingTeamIds.filter((id) => id !== job.assignedEngineerId)].filter(Boolean).map((id, index) => employeeName(id) + (index === 0 ? " (accountable)" : "")).join(", ") || "Not assigned"}</p></div></div><p className="instructions-text">{job.samplingInstructions || "No specific sampling instructions recorded for this job."}</p></section>}
          {stage !== "job" && stage !== "type" && stage !== "bottomhole" && currentJob && <div className="track-job-link"><button type="button" className="outline-button" onClick={() => { setWorkflowJobId(currentJob.id); setWorkspaceView("workflow"); }}>View job workflow & summary</button></div>}
          {stage !== "job" && stage !== "type" && stage !== "bottomhole" && <section className="panel"><div className="panel-heading"><div><h2>Client Focal Point</h2><p>Recorded at Job Setup · Reference for the sampling team</p></div></div><div className="job-details-grid"><div><small>NAME</small><strong>{job.clientFocalPoint || "Not specified"}</strong></div><div><small>CONTACT NUMBER</small><strong>{job.clientFocalPointContact || "Not specified"}</strong></div><div><small>EMAIL</small><strong>{job.clientFocalPointEmail || "Not specified"}</strong></div></div></section>}
          {stage === "job" && (() => {
            const editingDraft = !currentJob || isDraft(currentJob);
            const positionName = (e: Employee) => directory.positions.find((p) => p.id === e.positionId)?.name || e.role;
            const personLabel = (e: Employee) => `${e.name} — ${positionName(e)}`;
            // Every active employee, from any department, can be assigned; the sampling department is listed first.
            const samplingCandidates = demoEmployees.filter((e) => e.active);
            const samplingDepartment = (e: Employee) => e.departmentId === "sampling" || e.role === "sampling";
            const driverCandidates = demoEmployees.filter((e) => e.active);
            const isDriver = (e: Employee) => e.departmentId === "transport" || e.role === "transport";
            const approver = roleHolder(responsibilities, "samplingApproval", demoEmployees);
            const team = [job.assignedEngineerId, ...job.samplingTeamIds.filter((id) => id !== job.assignedEngineerId)].filter(Boolean);
            const toggleMember = (id: string, on: boolean) => { setJob((current) => ({ ...current, samplingTeamIds: on ? [...current.samplingTeamIds.filter((x) => x !== id), id] : current.samplingTeamIds.filter((x) => x !== id) })); setDispatchReview(false); setJobErrors([]); };
            const memberBox = (e: Employee) => <label key={e.id} className={"ops-check" + (job.samplingTeamIds.includes(e.id) ? " is-backup" : "")}><input type="checkbox" checked={job.samplingTeamIds.includes(e.id)} onChange={(event) => toggleMember(e.id, event.target.checked)} />{personLabel(e)}{job.samplingTeamIds.includes(e.id) && <span className="crew-role">Backup</span>}</label>;
            // Section status uses the workflow colours: gray not started, yellow in progress, green complete.
            const focalNeeded = job.samplingPlan.some((row) => !isMpsrLabTransfer(row.source as SamplingSource) && row.source !== "Other");
            const sectionState = (checks: boolean[], started = checks.some(Boolean)) => checks.every(Boolean) ? "completed" : started ? "in-progress" : "not-started";
            const detailsChecks = [!!client, !!job.fieldArea.trim(), job.wells.some((w) => w.trim()) && job.wells.every((w) => w.trim()), !!job.description.trim(), ...(focalNeeded ? [!!job.clientFocalPoint.trim(), !!job.clientFocalPointContact.trim()] : [])];
            // The Job Date is filled in automatically, so it counts towards complete but not towards "started".
            const detailsState = sectionState([...detailsChecks, !!job.dateReceived], detailsChecks.some(Boolean) || !!job.clientFocalPoint.trim() || !!job.dueDate);
            const scopeState = !job.samplingPlan.length ? "not-started" : planErrors(job.samplingPlan, sourceLabel).length || (job.samplingPlan.some((row) => row.source === "Other") && !job.otherSamplingType.trim()) ? "in-progress" : "completed";
            const crewState = sectionState([!!job.assignedEngineerId, !!job.assignedDriverId, !!job.samplingInstructions.trim()]);
            const stateChip = (state: string) => <span className={"section-state st-" + state}>{state === "completed" ? "✓ Complete" : state === "in-progress" ? "In progress" : "Not started"}</span>;
            return <form onSubmit={submitJob} className="job-create-form">
              {editingDraft && <p className="form-legend" aria-hidden="true"><b>Colour guide:</b><span><i className="lg-todo" /> To fill in</span><span><i className="lg-todo lg-required" /> Required, still empty</span><span><i className="lg-done" /> Filled</span><span><i className="lg-locked" /> Locked</span><span className="lg-chips"><em className="st-not-started">Not started</em><em className="st-in-progress">In progress</em><em className="st-completed">Complete</em></span></p>}
              <section className="panel client-panel">
                <div className="panel-heading job-details-heading"><span className="section-number">01</span><div><h2>Job details {stateChip(detailsState)}</h2><p>Client, location, job dates and what the client has requested.</p></div>
                  <div className={"job-id-badge" + (currentJob ? " is-saved" : client ? " is-pending" : " empty")} aria-live="polite"><small>JOB ID</small><strong>{client ? displayJobId : "Select a client"}</strong><span>{currentJob ? "Reserved" : client ? "Reserved when you save or send" : "Appears when you pick a client"}</span></div>
                </div>
                <div className="client-grid" role="group" aria-label="Client *">
                  {activeClients.map((item) => <button type="button" key={item.code} disabled={!!currentJob} className={client === item.code ? "client-option selected" : "client-option"} aria-pressed={client === item.code} onClick={() => { setClient(item.code); if (!currentJob) setCreatedJobId(""); setJobErrors([]); setDispatchReview(false); }}><ClientLogo client={item} /><strong>{item.shortName}</strong><small>{item.name !== item.shortName ? item.name : item.country}</small><span className="client-code">Code {item.code}</span><i aria-hidden="true">✓</i></button>)}
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
                  <label><span>Job Date *</span><DateInput required value={job.dateReceived} onChange={(e) => updateJob("dateReceived", e.target.value)} /><small>When the job starts (request received).</small></label>
                  <label><span>Due Date</span><DateInput value={job.dueDate} min={job.dateReceived || undefined} onChange={(e) => updateJob("dueDate", e.target.value)} /><small>When the job must be finished.</small></label>
                  <label className="full-field"><span>Job / request description *</span><textarea required rows={3} maxLength={500} value={job.description} onChange={(e) => updateJob("description", e.target.value)} placeholder="e.g. PVT study on separator oil and gas samples from TEST-01. Sampling report and final PVT report required." /><small className="field-help">What the client has asked for and the expected deliverables. Everyone working on the job sees this. <span>{job.description.length} / 500</span></small></label>
                </div>
              </section>

              <section className="panel job-sampling-panel">
                <div className="panel-heading"><span className="section-number">02</span><div><h2>Sampling type &amp; sampling scope {stateChip(scopeState)}</h2><p>What the sampling team must collect. Select one or more types; each gets its own quantity. Laboratory tests are selected per sample after the sampling report is approved.</p></div></div>
                <div className="prep-type-grid compact-job-types" role="group" aria-label="Sampling types">
                  {samplingSources.map((type) => { const on = job.samplingPlan.some((row) => row.source === type); return <button key={type} type="button" disabled={!editingDraft} aria-pressed={on} className={`prep-type-card functional ${on ? "selected" : ""}`} onClick={() => toggleSamplingType(type)}><div><strong>{type}</strong><small>{on ? (samplingIsRequired(type) ? "SELECTED · SAMPLING REQUIRED" : "SELECTED · NO FIELD SAMPLING") : "SELECT TYPE"}</small></div><i>{on ? "✓" : ""}</i></button>; })}
                </div>
                {job.samplingPlan.some((row) => row.source === "Other") && <label className="other-sampling-type-field"><span>Specify Other Type *</span><input value={job.otherSamplingType} onChange={(event) => updateJob("otherSamplingType", event.target.value)} placeholder="Enter the job or transfer type" /></label>}
                {job.samplingPlan.length > 0 ? <div className="sampling-plan">
                  {job.samplingPlan.map((row, index) => <div className="sampling-plan-row" key={row.source}>
                    <div className="sampling-plan-head"><strong>{sourceLabel(row.source)}</strong>{index === 0 && job.samplingPlan.length > 1 && <span className="plan-tag" title="Sampling preparation follows this type first">Primary</span>}<span className="plan-summary">{rowSummary(row)}</span></div>
                    <div className="sampling-plan-fields">
                      {isSeparator(row) ? <>
                        <label><span>Number of sets *</span><input type="number" min="1" max="20" step="1" placeholder="0" disabled={!editingDraft} value={row.count} onChange={(event) => updatePlanRow(row.source, { count: event.target.value })} /><small>1 set = 1 oil + 1 gas cylinder</small></label>
                        <label><span>Oil cylinders *</span><input type="number" min="0" max="40" step="1" placeholder="0" disabled={!editingDraft} value={row.oil ?? ""} onChange={(event) => updatePlanRow(row.source, { oil: event.target.value })} /><small>Defaults to the number of sets</small></label>
                        <label><span>Gas cylinders *</span><input type="number" min="0" max="40" step="1" placeholder="0" disabled={!editingDraft} value={row.gas ?? ""} onChange={(event) => updatePlanRow(row.source, { gas: event.target.value })} /><small>Defaults to the number of sets</small></label>
                      </> : <label><span>Number of samples *</span><input type="number" min="1" max="20" step="1" placeholder="0" disabled={!editingDraft} value={row.count} onChange={(event) => updatePlanRow(row.source, { count: event.target.value })} /><small>{row.source === CASED_HOLE ? "Cased hole: at least 3 unless a note explains why" : "One record per sample"}</small></label>}
                      <label className="plan-note"><span>Quantity notes{row.source === CASED_HOLE && Number(row.count) < 3 ? " *" : ""}</span><input disabled={!editingDraft} value={row.note || ""} onChange={(event) => updatePlanRow(row.source, { note: event.target.value })} placeholder={row.source === CASED_HOLE ? "Reason for fewer than 3 cased-hole samples, or other quantity requirements" : "Optional quantity requirements"} /></label>
                    </div>
                  </div>)}
                  {(() => { const records = planRecords(job.samplingPlan); return records.length > 0 && <div className="sampling-plan-records"><p><strong>{records.length} sample record{records.length === 1 ? "" : "s"}</strong> will be created when sent, numbered in one sequence across all types:</p><ul>{records.map((record) => <li key={record.id}><b>{record.id}</b> {[job.samplingPlan.length > 1 ? sourceLabel(record.source).replace(/ \(.*\)$/, "") : "", record.set ? `Set ${record.set}` : "", record.phase].filter(Boolean).join(" · ") || sourceLabel(record.source).replace(/ \(.*\)$/, "")}</li>)}</ul></div>; })()}
                </div> : <p className="sampling-plan-empty">Select at least one sampling type above.</p>}
                <label className="scope-upload"><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(event) => attachScopeOfWork(event.target.files?.[0])} /><span>{scopeAttachment ? "Replace file" : "Attach client request / scope document (optional)"}</span><small>PDF, Word, Excel, or image · You can continue without a file.</small></label>
                {scopeAttachment && <div className="attachment-record"><div><strong>{scopeAttachment.name}</strong><small>{Math.max(1, Math.round(scopeAttachment.size / 1024))} KB · Stored in local demo data</small></div><a href={scopeAttachment.dataUrl} download={scopeAttachment.name}>Open / download</a><button type="button" onClick={() => setScopeAttachment(null)}>Remove</button></div>}
                {job.requiredTests.length > 0 && <div className="reference-note"><strong>Initial laboratory request (reference only)</strong><p>{job.requiredTests.map((test) => test === "Other" ? job.otherTests.trim() || "Other" : test).join(" · ")}</p><small>Recorded when the job was created. It is not the approved laboratory scope, which is released per sample after sampling approval.</small></div>}
              </section>

              <section className="panel ops-panel instructions-panel">
                <div className="panel-heading"><span className="section-number">03</span><div><h2>Sampling assignment &amp; instructions {stateChip(crewState)}</h2><p>Only the people named here receive the job. Nobody is assigned automatically.</p></div></div>
                <div className="form-grid">
                  <label><span>Accountable sampling employee *</span><select value={job.assignedEngineerId} onChange={e=>{const id=e.target.value;setJob(current=>({...current,assignedEngineerId:id,samplingTeamIds:current.samplingTeamIds.filter(x=>x!==id)}));setDispatchReview(false);setJobErrors([]);}}><option value="">Select employee</option><optgroup label="Sampling team">{samplingCandidates.filter(samplingDepartment).map(e=><option key={e.id} value={e.id}>{personLabel(e)}{e.id===currentEmployee?.id?" (you)":""}</option>)}</optgroup><optgroup label="All other employees">{samplingCandidates.filter(e=>!samplingDepartment(e)).map(e=><option key={e.id} value={e.id}>{personLabel(e)}{e.id===currentEmployee?.id?" (you)":""}</option>)}</optgroup></select><small>Owns the sampling work and its report.</small><OverlapNotice jobs={jobs} employees={demoEmployees} employeeId={job.assignedEngineerId} start={job.dateReceived} end={job.dueDate} exclude={["sampling:"+(currentJob?.id||""),"driver:"+(currentJob?.id||"")]} jobDates /></label>
                  <label><span>Driver *</span><select value={job.assignedDriverId} onChange={e=>{updateJob("assignedDriverId",e.target.value);setDispatchReview(false);}}><option value="">Select driver</option><optgroup label="Drivers">{driverCandidates.filter(isDriver).map(e=><option key={e.id} value={e.id}>{personLabel(e)}</option>)}</optgroup><optgroup label="All other employees">{driverCandidates.filter(e=>!isDriver(e)).map(e=><option key={e.id} value={e.id}>{personLabel(e)}{e.id===currentEmployee?.id?" (you)":""}</option>)}</optgroup></select><small>Transports the samples after sampling-report approval.</small><OverlapNotice jobs={jobs} employees={demoEmployees} employeeId={job.assignedDriverId} start={job.dateReceived} end={job.dueDate} exclude={["sampling:"+(currentJob?.id||""),"driver:"+(currentJob?.id||"")]} jobDates /></label>
                  <fieldset className="full-field team-members"><legend>Backup / support sampling employees (optional)</legend>
                    {job.assignedEngineerId && <p className="crew-accountable"><span className="crew-role accountable">Accountable</span>{employeeName(job.assignedEngineerId)} <small>chosen above</small></p>}
                    {samplingCandidates.filter(e=>samplingDepartment(e)&&e.id!==job.assignedEngineerId).map(memberBox)}{samplingCandidates.some(e=>!samplingDepartment(e)&&e.id!==job.assignedEngineerId)&&<details><summary>All other employees</summary>{samplingCandidates.filter(e=>!samplingDepartment(e)&&e.id!==job.assignedEngineerId).map(memberBox)}</details>}
                    <small className="field-help">Backup employees see the job, its instructions and the sampling data, and can support or take over in the field. The accountable employee stays the single owner.</small>{job.samplingTeamIds.filter(id=>id!==job.assignedEngineerId).map(id=><OverlapNotice key={id} jobs={jobs} employees={demoEmployees} employeeId={id} start={job.dateReceived} end={job.dueDate} exclude={["sampling:"+(currentJob?.id||""),"driver:"+(currentJob?.id||"")]} jobDates />)}</fieldset>
                </div>
                <div className="assignment-summary"><strong>Receives this job:</strong> {team.length || job.assignedDriverId ? <span className="crew-list">{team.map((id, index) => <span key={id} className="crew-person">{employeeName(id)} <span className={"crew-role" + (index === 0 ? " accountable" : "")}>{index === 0 ? "Accountable" : "Backup"}</span></span>)}{job.assignedDriverId && <span className="crew-person">{employeeName(job.assignedDriverId)} <span className="crew-role driver">Driver</span></span>}</span> : "Nobody assigned yet"}</div>
                <label className="full-field instructions-field"><span>Sampling instructions *</span><textarea required rows={5} value={job.samplingInstructions} onChange={(e) => updateJob("samplingInstructions", e.target.value)} placeholder="e.g. Confirm the separator sampling point with the client focal point before rig-up. Sample at stable separator conditions and record separator pressure and temperature. Report any H₂S readings immediately." /><small className="field-help">How the field team must carry out the sampling: site and sampling point, conditions to confirm, safety notes. Only the assigned crew see this.</small></label>
              </section>

              {dispatchReview && editingDraft && (() => {
                const backups = job.samplingTeamIds.filter((id) => id !== job.assignedEngineerId);
                const records = planRecords(job.samplingPlan);
                return <section className="panel ops-panel send-review" aria-live="polite">
                  <div className="send-review-head"><div><span className="eyebrow">STEP 1 OF 5 · FINAL CHECK</span><h2>Review before sending to Sampling</h2><p>Check the details below. Use <strong>Back to editing</strong> to change anything, or <strong>Confirm &amp; send</strong> to release the job to the sampling team.</p></div><div className="job-id-badge"><small>JOB ID</small><strong>{displayJobId}</strong><span>{clientName}</span></div></div>
                  <div className="send-review-group"><h3>1 · Job details</h3><dl className="review-grid">
                    <div><dt>Client</dt><dd>{clientName}</dd></div>
                    <div><dt>Job date → due date</dt><dd>{ukDate(job.dateReceived) || "Not recorded"} → {ukDate(job.dueDate) || "Not recorded"}</dd></div>
                    <div><dt>Location</dt><dd>{[job.countryCode, job.fieldArea, job.wells.filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</dd></div>
                    <div><dt>Client focal point</dt><dd>{[job.clientFocalPoint, job.clientFocalPointContact, job.clientFocalPointEmail].filter(Boolean).join(" · ") || "Not recorded"}</dd></div>
                    <div className="full-field"><dt>Job / request description</dt><dd className="instructions-text">{job.description}</dd></div>
                  </dl></div>
                  <div className="send-review-group"><h3>2 · Sampling scope</h3><ul className="review-plan">{job.samplingPlan.map((row) => <li key={row.source}><strong>{sourceLabel(row.source)}</strong> · {rowSummary(row)}{row.note ? ` · ${row.note}` : ""}</li>)}</ul><p className="review-records">{records.length} sample record{records.length === 1 ? "" : "s"}: {records.map((record) => record.id).join(", ")}{scopeAttachment ? ` · Attached: ${scopeAttachment.name}` : ""}</p></div>
                  <div className="send-review-group"><h3>3 · Crew &amp; instructions</h3><dl className="review-grid">
                    <div><dt>Accountable</dt><dd>{employeeName(job.assignedEngineerId)}</dd></div>
                    <div><dt>Backup / support</dt><dd>{backups.map(employeeName).join(", ") || "None"}</dd></div>
                    <div><dt>Driver</dt><dd>{employeeName(job.assignedDriverId)}</dd></div>
                    <div className="full-field"><dt>Sampling instructions</dt><dd className="instructions-text">{job.samplingInstructions}</dd></div>
                  </dl></div>
                  <div className="send-review-group"><h3>4 · Approval</h3><p className="review-approval">No approval is needed to send this job. The sampling report will be approved by {approver ? <strong>{employeeName(approver)}</strong> : "the sampling approver (not configured yet; ask an administrator to set it in Settings → Authorization)"} (Sampling approval).</p></div>
                  <div className="send-review-group send-review-next"><h3>What happens when you send</h3><ul className="send-notify">
                    <li>The job moves to <strong>Sampling</strong>. Next action: {samplingIsRequired(samplingType) ? "complete sampling preparation" : "complete pre-job coordination"}.</li>
                    <li><strong>{employeeName(job.assignedEngineerId)}</strong> receives the job as a task in My work.</li>
                    {backups.length > 0 && <li><strong>{backups.map(employeeName).join(", ")}</strong> {backups.length === 1 ? "sees" : "see"} the job as backup.</li>}
                    <li><strong>{employeeName(job.assignedDriverId)}</strong> sees the transport as coming up.</li>
                    <li>The laboratory (scope selection and team leads) gets a heads-up with the general job details. No laboratory scope is set yet.</li>
                    <li>The Sequence of Events records the send automatically. No email is sent.</li>
                  </ul></div>
                </section>;
              })()}
              {jobErrors.length > 0 && <div className="preparation-validation" role="alert"><span>!</span><div><strong>{editingDraft ? "Job cannot be sent yet" : "Job cannot be saved"}</strong><ul>{jobErrors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}

              <div className="form-actions">{editingDraft ? <>{dispatchReview ? <button type="button" className="outline-button" onClick={() => setDispatchReview(false)}>Back to editing</button> : <button type="button" className="outline-button" onClick={saveDraft}>Save Draft</button>}<button type="submit" className="primary-button">{dispatchReview ? "Confirm & send to Sampling" : "Send to Sampling"} <span>→</span></button></> : <button type="submit" className="primary-button">Save job details <span>→</span></button>}</div>
            </form>;
          })()}

          {samplingFlow && samplingDataLocked(currentJob!) && (stage === "type" || stage === "bottomhole") && <p className="locked-note" role="status">This sampling data is {latestData(currentJob!)?.status === "Submitted" ? "submitted for review" : "approved"} and read-only. {latestData(currentJob!)?.status === "Submitted" ? "It becomes editable again if it is returned for correction." : "To correct it, reopen it with a reason in Sampling review & report."}</p>}
          <fieldset className="locked-fieldset" disabled={samplingFlow && samplingDataLocked(currentJob!)}>
          {stage === "type" && (() => { const prepChip = (done: number, total: number) => { const st = total && done >= total ? "completed" : done > 0 ? "in-progress" : "not-started"; return <span className={"section-state st-" + st}>{st === "completed" ? "✓ Complete" : st === "in-progress" ? `In progress · ${done} of ${total}` : "Not started"}</span>; };
            return <>
              {preparationError.length > 0 && <div className="preparation-validation" role="alert"><span>!</span><div><strong>Preparation cannot be completed</strong><ul>{preparationError.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
              {samplingType && <section className="panel coordination-panel prep-step">
                <div className="panel-heading premium-heading"><span className="prep-step-num">1</span><div><span className="eyebrow">STEP 1</span><h2>Pre-job checklist {prepChip(coordinationTasks.filter((item) => item.completed).length, coordinationTasks.length)}</h2><p>Tick each item when it is done. Items that need details open so you can fill them in first. Each tick is recorded with your name and time.</p></div></div>
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
                    return <details key={task.id} className={"readiness-action " + (notApplicable ? "is-na" : task.completed ? "is-done" : "is-pending")}>
                      <summary><input type="checkbox" className="readiness-check" checked={task.completed} disabled={tools || availability} title={tools || availability ? "Ticked automatically when you select the answer" : undefined} aria-label={title} onChange={(event) => { const row = event.currentTarget.closest("details"); if (!toggleCoordinationTask(task.id, event.target.checked) && row) row.open = true; }} /><span className="readiness-number">{index + 1}</span><div><strong>{title}</strong><small>{task.completed ? `${employeeName(task.completedBy)} · ${formatDateTime(task.completedAt)}` : tools || availability ? "Open and select the answer" : contact ? "Tick when done" : "Open to fill the details, then tick"}</small></div><em className={"section-state " + (notApplicable ? "st-not-started" : task.completed ? "st-completed" : "st-in-progress")}>{notApplicable ? "Not applicable" : task.completed ? "✓ Done" : "To do"}</em></summary>
                      <div className="readiness-body">
                        {contact && <><div className="job-details-grid"><div><small>CLIENT FOCAL POINT</small><strong>{job.clientFocalPoint || "Not specified"}</strong></div><div><small>CONTACT NUMBER</small><strong>{job.clientFocalPointContact || "Not specified"}</strong></div><div><small>EMAIL</small><strong>{job.clientFocalPointEmail || "Not specified"}</strong></div></div><label>Contact notes (optional)<textarea rows={2} value={coordinationDetails.contactNotes || ""} onChange={(event) => updateCoordinationDetail("contactNotes", event.target.value)} /></label></>}
                        {tools && <label>Are tools required?<select value={coordinationDetails.toolsRequired} onChange={(event) => updateCoordinationDetail("toolsRequired", event.target.value)}>{["To Be Confirmed", "Required", "Not Required"].map((value) => <option key={value}>{value}</option>)}</select></label>}
                        {availability && (notApplicable ? <p>No tools are required. This check is not applicable.</p> : <><label>Tools availability<select disabled={coordinationDetails.toolsRequired !== "Required"} value={coordinationDetails.toolsAvailability === "Not Available" ? "Unavailable" : coordinationDetails.toolsAvailability} onChange={(event) => updateCoordinationDetail("toolsAvailability", event.target.value)}>{["To Be Confirmed", "Available", "Partially Available", "Unavailable"].map((value) => <option key={value}>{value}</option>)}</select></label>{coordinationDetails.toolsRequired !== "Required" && <p>Confirm whether tools are required first.</p>}{["Partially Available", "Unavailable", "Not Available"].includes(coordinationDetails.toolsAvailability) && <label>Missing tools / items<textarea rows={3} value={coordinationDetails.missingTools || ""} onChange={(event) => updateCoordinationDetail("missingTools", event.target.value)} /></label>}</>)}
                        {kit && <label>Sample kit details *<textarea rows={3} value={coordinationDetails.requiredSampleKit} onChange={(event) => updateCoordinationDetail("requiredSampleKit", event.target.value)} placeholder="Kit type, quantity and reference" /></label>}
                        {cylinders && <><p>Receiving containers from the sample records. Complete their details below, then tick this item.</p><div className="readiness-bottles">{samples.map((sample) => <div key={sample.id}><strong>Sample {sample.id}</strong><CylinderPicker inventory={bottleInventory} status={cylStatus} jobId={currentJob?.id || jobId} sample={sample} onSelect={(serial) => updatePreparationSample(sample.id, "bottleSerial", serial)} onField={(field, value) => updatePreparationSample(sample.id, field, value)} />{isSpmcFieldSampling(samplingType) && <section className="cylinder-record-notes"><label>Remarks<input value={sample.preparationRemarks} onChange={(event) => updatePreparationSample(sample.id, "preparationRemarks", event.target.value)} placeholder="Equipment condition, exceptions, or handling notes" /></label><div><small>PREPARED BY</small><strong>{employeeName(sample.preparedBy || currentEmployee.id)}</strong><small>PREPARATION DATE / TIME</small><strong>{formatDateTime(sample.preparedAt || preparationStartedAt)}</strong></div><button type="button" className="remove-sample-button" onClick={() => removeSample(sample.id)}>Remove sample</button></section>}</div>)}</div></>}
                        {point && <>{task.label.includes("type") && <label>Sampling point type *<input value={coordinationDetails.samplingPointType} onChange={(event) => updateCoordinationDetail("samplingPointType", event.target.value)} /></label>}{task.label.includes("size") && <label>Sampling point size *<input value={coordinationDetails.samplingPointSize} onChange={(event) => updateCoordinationDetail("samplingPointSize", event.target.value)} /></label>}{task.label === "Confirm separator sampling point" && <label>Separator sampling point *<input value={job.samplingPoint} onChange={(event) => { updateJob("samplingPoint", event.target.value); if (task.completed) toggleCoordinationTask(task.id, false); }} /></label>}</>}
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
                {isSpmcFieldSampling(samplingType) && samples[0] && <section className="panel general-sampler-panel prep-step">
                  <div className="panel-heading premium-heading"><span className="prep-step-num">2</span><div><span className="eyebrow">STEP 2</span><h2>Downhole sampling tool {prepChip(samples[0].samplerSerial ? 1 : 0, 1)}</h2><p>One tool for all samples in this job: enter its serial number and checks.</p></div></div>
                  <div className="compact-fields three"><label><span>Sampler Type *</span><select value={DOWNHOLE_TOOL} disabled><option>{DOWNHOLE_TOOL}</option></select></label><label><span>Sampler Serial Number *</span><input value={samples[0].samplerSerial} onChange={(event) => updateGeneralSampler("samplerSerial", event.target.value)} placeholder="e.g. TOOL-24018" /></label><label><span>Calibration Status</span><select value={samples[0].calibrationStatus} onChange={(event) => updateGeneralSampler("calibrationStatus", event.target.value)}>{["Valid", "Expired", "Not Required", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Pressure Test Status</span><select value={samples[0].pressureTestStatus} onChange={(event) => updateGeneralSampler("pressureTestStatus", event.target.value)}>{["Passed", "Failed", "Not Required", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Equipment Condition</span><select value={samples[0].equipmentCondition} onChange={(event) => updateGeneralSampler("equipmentCondition", event.target.value)}>{["Good", "Requires Attention", "Not Checked"].map((status) => <option key={status}>{status}</option>)}</select></label></div>
                </section>}
                {isCasedHoleSampling(samplingType) && samples.length < 3 && <div className="sample-count-warning"><span>!</span>Cased Hole sampling requires at least 3 samples for completion. Add a preparation note to document any draft plan below this minimum.</div>}

                {!isSpmcFieldSampling(samplingType) && <div className="preparation-layout preparation-layout-single">
                  <section className="panel preparation-samples-panel prep-step">
                    <div className="panel-heading premium-heading"><span className="prep-step-num">2</span><div><span className="eyebrow">STEP 2</span><h2>Equipment per sample {prepChip(samples.filter((sample) => sample.sampler && sample.samplerSerial && containerComplete(sample)).length, samples.length)}</h2><p>Open each sample and record its downhole sampling tool, receiving cylinder and equipment checks.</p></div></div>
                    <div className="preparation-accordion">
                      {samples.map((sample, index) => { const ready = Boolean(sample.sampler && sample.samplerSerial && containerComplete(sample)); return <article className={expanded === sample.id ? "preparation-sample open" : "preparation-sample"} key={sample.id}>
                        <button type="button" className="preparation-sample-toggle" onClick={() => setExpanded(expanded === sample.id ? "" : sample.id)} aria-expanded={expanded === sample.id}><span className="sample-index">{String(index + 1).padStart(2, "0")}</span><div><strong>Sample {sample.id}</strong><small>{isSpmcFieldSampling(samplingType) ? containerLabel(sample, containerNoun(sample) + " pending") : `${sample.sampler} · ${sample.samplerSerial || "Sampler serial pending"} / ${containerLabel(sample, containerNoun(sample) + " pending")}`}</small></div><span className={"section-state " + (ready ? "st-completed" : "st-in-progress")}>{ready ? "✓ Prepared" : "Details required"}</span><b>⌄</b></button>
                        {expanded === sample.id && <div className="preparation-sample-body">
                          {!isSpmcFieldSampling(samplingType) && <section className="equipment-group sampler-group"><header><span>↓</span><div><small>DOWNHOLE EQUIPMENT</small><h3>Downhole Sampler</h3></div></header><div className="compact-fields"><label><span>Sampler Type *</span><select value={sample.sampler} onChange={(event) => updatePreparationSample(sample.id, "sampler", event.target.value)}>{samplerTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label><span>Sampler Serial Number *</span><input value={sample.samplerSerial} onChange={(event) => updatePreparationSample(sample.id, "samplerSerial", event.target.value)} placeholder="e.g. TOOL-24018" /></label></div></section>}
                          <section className="equipment-group bottle-group"><header><span>▯</span><div><small>SAMPLE CONTAINMENT</small><h3>Receiving Cylinder / Container</h3></div></header><CylinderPicker inventory={bottleInventory} status={cylStatus} jobId={currentJob?.id || jobId} sample={sample} onSelect={(serial) => updatePreparationSample(sample.id, "bottleSerial", serial)} onField={(field, value) => updatePreparationSample(sample.id, field, value)} /></section>
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
            </>;
          })()}

          {stage === "scope" && report.reportStatus === "Completed" && !!report.approvedBy && report.approvedAt && (
            <section className="final-report-ready panel"><div className="scope-route"><span>✓</span><div><strong>Final report generated</strong><small>{displayJobId} · {report.reportStatus} · Approved by {employeeName(report.approvedBy)}</small></div></div><div className="final-report-actions"><button type="button" className="text-button" onClick={() => setStage("report")}>← Back to report preview</button>{scopeAttachment && <a className="outline-button" href={scopeAttachment.dataUrl} download={scopeAttachment.name}>Open Scope of Work</a>}<button type="button" className="primary-button" onClick={() => downloadReportPdf("save")} disabled={pdfExporting}>{pdfExporting ? "Preparing PDF..." : "Download PDF"}</button></div></section>
          )}

          {stage === "bottomhole" && isCasedHoleSampling(samplingType) && (
            <>
              {Object.values(sampleDataErrors).some((errors) => errors.length) && <div className="sampling-data-validation" role="alert"><span>!</span><div><strong>Sampling Data requires attention</strong><p>Complete the highlighted sample records before continuing.</p></div></div>}


              <section className="panel sampling-data-panel prep-step">
                <div className="panel-heading premium-heading"><span className="prep-step-num">1</span><div><span className="eyebrow">STEP 1</span><h2>Sampling data per sample {stepChip(samples.filter((sample) => sample.dataComplete).length, samples.length)}</h2><p>Open each sample, fill in its data sheet with values and units, then mark it complete. The preparation details are shown read-only at the top of each sample.</p></div></div>
                <div className="sampling-data-accordion">
                  {samples.map((sample, index) => { const status = sampleDataStatus(sample); return <article className={expanded === sample.id ? "sampling-data-sample open" : "sampling-data-sample"} key={sample.id}>
                    <button type="button" className="sampling-data-toggle" onClick={() => setExpanded(expanded === sample.id ? "" : sample.id)} aria-expanded={expanded === sample.id}>
                      <span className="sample-index">{String(index + 1).padStart(2, "0")}</span>
                      <div className="sample-heading"><strong>Sample {sample.id}</strong><small>{sample.sampler} · {sample.samplerSerial || "Serial pending"} / {containerLabel(sample, containerNoun(sample) + " pending")}</small></div>
                      <div className="sample-date"><small>SAMPLING DATE / TIME</small><strong>{sample.fieldData.samplingDate || sample.fieldData.samplingTime ? `${sample.fieldData.samplingDate || "Date pending"} · ${sample.fieldData.samplingTime || "Time pending"}` : "Not recorded"}</strong></div>
                      {dataChip(status)}<b>⌄</b>
                    </button>
                    {expanded === sample.id && <div className="sampling-data-body">
                      <section className="preparation-reference"><header><div><small>READ-ONLY REFERENCE</small><h3>Sampling Preparation</h3></div><span>Locked</span></header><div className="preparation-reference-grid">
                        <div><small>SAMPLE</small><strong>{sample.id}</strong></div><div><small>SAMPLER TYPE</small><strong>{sample.sampler}</strong></div><div><small>SAMPLER SERIAL</small><strong>{sample.samplerSerial || "Not specified"}</strong></div>{isAtmospheric(sample) ? <><div><small>CONTAINER TYPE</small><strong>{containerNoun(sample)}</strong></div><div><small>CONTAINER VOLUME</small><strong>{sample.containerVolume || containerId(sample) || "Not specified"}</strong></div></> : <><div><small>CYLINDER TYPE</small><strong>{sample.bottle}</strong></div><div><small>CYLINDER SERIAL</small><strong>{sample.bottleSerial || "Not specified"}</strong></div><div><small>CYLINDER CAPACITY</small><strong>{sample.bottleCapacity || "Not specified"}</strong></div></>}<div><small>PREPARED BY</small><strong>{employeeName(sample.preparedBy)}</strong></div><div><small>PREPARED DATE / TIME</small><strong>{formatDateTime(sample.preparedAt)}</strong></div>
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

              <section className="panel source-data-panel prep-step"><div className="panel-heading premium-heading"><span className="prep-step-num">1</span><div><span className="eyebrow">STEP 1</span><h2>{samplingTypeLabel} conditions</h2><p>Conditions for the whole job, if known, with their units. The data sheet for each sample follows in Step 2.</p></div></div><div className="form-grid source-data-grid">
                {samplingType === "Wellhead Sampling" && <>{contextUnitField("WHP if known", "whp", pressureUnits)}{contextUnitField("WHT if known", "wht", temperatureUnits)}<label className="full-field"><span>Wellhead Conditions / Notes</span><textarea rows={4} value={job.locationNotes} onChange={(event) => updateJob("locationNotes", event.target.value)} /></label></>}
                {samplingType === "Separator Sampling" && <>{contextUnitField("Separator Pressure if known", "separatorPressure", pressureUnits)}{contextUnitField("Separator Temperature if known", "separatorTemperature", temperatureUnits)}{contextUnitField("Choke Size", "chokeSize", chokeUnits)}{contextUnitField("Oil Rate", "oilRate", liquidRateUnits)}{contextUnitField("Gas Rate", "gasRate", gasRateUnits)}{contextUnitField("Water Rate", "waterRate", liquidRateUnits)}{contextTextField("Sampling Point", "samplingPoint", "e.g. 1st stage separator, gas outlet")}</>}
                {samplingType === "Other" && <><label><span>Location / Facility</span><input value={job.facility} onChange={(event) => updateJob("facility", event.target.value)} /></label><label><span>Sampling Point</span><input value={job.samplingPoint} onChange={(event) => updateJob("samplingPoint", event.target.value)} /></label><label className="full-field"><span>Description</span><textarea rows={5} value={job.otherDescription} onChange={(event) => updateJob("otherDescription", event.target.value)} /></label></>}
              </div></section>
              <section className="panel generic-samples-panel prep-step"><div className="panel-heading premium-heading"><span className="prep-step-num">2</span><div><span className="eyebrow">STEP 2</span><h2>Sample data sheets {stepChip(samples.filter((sample) => sample.dataComplete).length, samples.length)}</h2><p>Fill in the data sheet for every sample, with values and units, then mark it complete.</p></div><button type="button" className="outline-button" onClick={addSample}>+ Add Sample</button></div><div className="generic-sample-list">{samples.map((sample, index) => <Fragment key={sample.id}>{inSeparatorSet(sample) && !samples.slice(0, index).some((other) => inSeparatorSet(other) && other.set === sample.set) && <div className="set-conditions">{standardDataSheetForm(sample, "production")}</div>}<article className={expanded === sample.id ? "is-open" : undefined}><header><button type="button" className="generic-sample-toggle" aria-expanded={expanded === sample.id} onClick={() => setExpanded(expanded === sample.id ? "" : sample.id)}><strong>Sample {sample.id}</strong><small>{[sample.set ? `Set ${sample.set}` : "", sample.phase, containerLabel(sample, "Container not selected")].filter(Boolean).join(" · ")}</small></button>{dataChip(sampleDataStatus(sample))}<button type="button" onClick={() => removeSample(sample.id)}>Remove</button></header>{expanded === sample.id && <><section className="data-section generic-bottle-reference"><header><span>00</span><div><small>SAMPLE CONTAINER</small><h3>Cylinder / Container Reference</h3></div></header><CylinderPicker inventory={bottleInventory} status={cylStatus} jobId={currentJob?.id || jobId} sample={sample} onSelect={(serial) => updatePreparationSample(sample.id, "bottleSerial", serial)} onField={(field, value) => updatePreparationSample(sample.id, field, value)} /></section>{standardDataSheetForm(sample)}{sampleDataErrors[sample.id]?.length > 0 && <div className="sample-data-errors" role="alert"><strong>Complete the following:</strong><ul>{sampleDataErrors[sample.id].map((error) => <li key={error}>{error}</li>)}</ul></div>}<footer className="sample-completion-bar"><div><small>DATA ENTRY TRACKING</small><strong>{sample.dataComplete ? `Completed by ${employeeName(sample.dataCompletedBy)}` : `Data entered by ${currentEmployee.name}`}</strong><span>{sample.dataComplete ? formatDateTime(sample.dataCompletedAt) : "Complete every standard data-sheet section to finish this record."}</span></div><button type="button" className={sample.dataComplete ? "outline-button completed-button" : "primary-button"} onClick={() => markSampleComplete(sample.id)}>{sample.dataComplete ? "✓ Sample Complete" : "Mark Sample Complete"}</button></footer></>}</article></Fragment>)}</div></section>
              <section className="sampling-data-footer"><div><small>SAMPLING DATA TRACKING</small><strong>Entered by {currentEmployee.name}</strong><span>{locationSummary(job, samplingType)}</span></div><div><button type="button" className="text-button" onClick={() => setStage("type")}>← Back to Preparation</button><button type="button" className="outline-button" onClick={saveSamplingDataDraft}>Save Draft</button><button type="button" className="primary-button" onClick={completeSamplingData}>Complete Sampling Data &amp; Continue <span>→</span></button></div></section>
            </>
          )}

          </fieldset>
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
                  <div className="report-approval-grid"><label><span>Prepared By *</span><select value={report.preparedBy} disabled={report.reportStatus !== "Draft"} onChange={(event) => setReport((current) => ({ ...current, preparedBy: event.target.value }))}><option value="">Select employee</option>{demoEmployees.filter(e=>e.active || e.id===report.preparedBy).map((employee) => <option disabled={!employee.active} value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label><label><span>Prepared Date *</span><DateInput value={report.preparedDate} disabled={report.reportStatus !== "Draft"} onChange={(event) => setReport((current) => ({ ...current, preparedDate: event.target.value }))} /></label><label><span>Send To / Approver *</span><input value={report.approvedBy ? employeeName(report.approvedBy) : samplingApprover ? employeeName(samplingApprover) : "Not configured"} readOnly /></label><label><span>Approval Date</span><input value={report.approvalDate ? reportDate(report.approvalDate) : "Recorded automatically"} readOnly /></label></div>
                  {report.reportStatus === "Awaiting Approval" && <div className="approval-handoff-card"><div><span>APPROVAL REQUEST</span><strong>Sent to {employeeName(samplingApprover)}</strong><small>Submitted by {employeeName(report.submittedBy)} · {formatDateTime(report.submittedAt)}</small></div>{currentEmployee.id === samplingApprover ? <div><button type="button" className="outline-button" onClick={requestReportChanges}>Request Changes</button><button type="button" className="primary-button" onClick={approveFinalReport}>Approve &amp; Finalize Report <span>→</span></button></div> : <em>Waiting for the assigned approver</em>}</div>}
                  <div className="report-toolbar"><button type="button" className="text-button" disabled={report.reportStatus !== "Draft"} onClick={() => setStage("bottomhole")}>← Edit sampling data</button><div><button type="button" className="outline-button" onClick={saveReportDraft} disabled={report.reportStatus !== "Draft"}>Save Draft</button>{report.reportStatus === "Completed" && !!report.approvedBy && report.approvedAt && <><button type="button" className="outline-button" onClick={() => downloadReportPdf("save")} disabled={pdfExporting}>{pdfExporting ? "Preparing…" : "Save PDF"}</button><button type="button" className="outline-button" onClick={() => downloadReportPdf("print")} disabled={pdfExporting}>Print</button></>}<button type="button" className="primary-button" onClick={submitReportForApproval} disabled={report.reportStatus !== "Draft"}>{report.reportStatus === "Awaiting Approval" ? "Sent for Approval" : "Open checking & approval"} <span>→</span></button></div></div>
                </section>
              </>}

              {report.reportStatus !== "Completed" && <section className="panel approval-data-review"><h2>Full data for approval</h2><h3>Job and sampling context</h3><ReviewData value={{ jobId: displayJobId, clientName, samplingType, ...Object.fromEntries(Object.entries(job).filter(([key]) => !["requiredTests", "otherTests"].includes(key))) }} /><h3>Preparation and coordination</h3><ReviewData value={{ coordinationDetails, coordinationTasks }} />{scopeAttachment && <a href={scopeAttachment.dataUrl} download={scopeAttachment.name}>Review scope of work: {scopeAttachment.name}</a>}<h3>All sample and transfer records</h3>{samples.map(sample => <section key={sample.id}><h4>Sample {sample.id}</h4><ReviewData value={sample} /></section>)}<h3>Sequence of events</h3><ReviewData value={{ events: sortedEvents }} /></section>}
              {report.reportStatus === "Completed" && !!report.approvedBy && report.approvedAt && <article className="report-sheet final-sampling-report sr-preview" data-pdf-report>
                <SamplingReportDocument input={samplingReportInput({ ...job, jobNumber: displayJobId, clientCode: currentJob?.clientCode, clientName, samplingSource: samplingType }, reportContext, { snapshot: { samples, events }, summary: report.summary, status: "Approved", approved: true, preparedBy: report.preparedBy, preparedAt: report.preparedDate, approvedBy: report.approvedBy, approvedAt: report.approvalDate })} />
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
