/** Empty field data sheet for one sample; shared by the job editor and the demo data. */
export const defaultFieldData = (): Record<string, string> => ({
  samplingDate: "", samplingTime: "", sampleNature: "BHS", samplingPoint: "", depthUnit: "m", formation: "", perforations: "", perforationsUnit: "m MD", flowPeriod: "", flowPeriodUnit: "h",
  bhp: "", bhpUnit: "psi", bht: "", bhtUnit: "°C", whp: "", whpUnit: "psi", wht: "", whtUnit: "°C", chokeSize: "", chokeSizeUnit: "/64 in", stableSince: "", separatorPressure: "", separatorPressureUnit: "psi", separatorTemperature: "", separatorTemperatureUnit: "°C",
  oilRate: "", oilRateUnit: "STB/d", correctedBy: "", gasRate: "", gasRateUnit: "MMscf/d", waterRate: "", waterRateUnit: "bbl/d", gasGravity: "", gasGravityUnit: "air = 1", condensateGravity: "", condensateGravityUnit: "SG 60/60 °F", oilLineTemperature: "", oilLineTemperatureUnit: "°C", gasDifferentialPressure: "", gasDifferentialPressureUnit: "psi", gasPressure: "", gasPressureUnit: "psi", gasTemperature: "", gasTemperatureUnit: "°C", fbFactor: "", fpvFactor: "", gor: "", gorUnit: "scf/STB", cgr: "", cgrUnit: "STB/MMscf", wor: "", worUnit: "bbl/bbl", bsw: "", bswUnit: "% vol", h2s: "", h2sUnit: "ppm", co2: "", co2Unit: "mol %",
  sampleBottleVolume: "", sampleBottleVolumeUnit: "cc", sampleVolume: "", sampleVolumeUnit: "cc", fluidRemaining: "", fluidRemainingUnit: "cc", gasCapCreated: "N/A", openingPressureReservoir: "", openingPressureReservoirUnit: "psi", openingTemperatureReservoir: "", openingTemperatureReservoirUnit: "°C", openingPressureAmbient: "", openingPressureAmbientUnit: "psi", openingTemperatureAmbient: "", openingTemperatureAmbientUnit: "°C", transferPressure: "", transferPressureUnit: "psi", transferTemperature: "", transferTemperatureUnit: "°C", finalPressure: "", finalPressureUnit: "psi", finalTemperature: "", finalTemperatureUnit: "°C", transferDuration: "", transferDurationUnit: "min",
});

/** Sampling points offered on the data sheet. N/A is for samples not taken at a separator point. */
export const samplingPointOptions = ["Sep. gas line / Gas", "Sep. oil sight glass / Oil", "N/A"];
/** Sampling point of a separator cylinder, from its phase. */
export const samplingPointFor = (phase?: string) => phase === "Gas" ? samplingPointOptions[0] : phase === "Oil" ? samplingPointOptions[1] : "";
/**
 * Data sheets saved before the opening pressure was split by temperature: the recorded sample-cylinder opening
 * pressure was read at ambient conditions, so it becomes the ambient pair. Nothing is invented for reservoir temperature.
 * Returns the same object when nothing changed.
 */
export function migrateFieldData(f: Record<string, string>): Record<string, string> {
  if (f.openingPressureAmbient !== undefined || f.initialOpeningPressure === undefined) return f;
  return { ...f, openingPressureAmbient: f.initialOpeningPressure || "", openingPressureAmbientUnit: f.initialOpeningPressureUnit || "psi", openingTemperatureAmbient: f.initialOpeningTemperature || "", openingTemperatureAmbientUnit: f.initialOpeningTemperatureUnit || "°C" };
}
