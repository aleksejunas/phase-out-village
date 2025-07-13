import React, {
  useEffect,
  useRef,
  useState,
  useReducer,
  useCallback,
  useMemo,
} from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Circle from "ol/style/Circle";
import Style from "ol/style/Style";
import { Fill, Stroke, Text } from "ol/style";
import "ol/ol.css";
import "./MapPage.css";
import { data } from "../../generated/data";
import { generateCompleteData } from "../../utils/projections";
import { OilFieldDataset, ShutdownMap } from "../../types/types";
import { EmissionsView } from "../../components/charts/EmissionsView";
import { type } from "os";
//import { FieldModal } from "../../components/modals/FieldModal";
// import of badge components removed due to missing module and unused imports

// Placeholder for FieldModal to resolve import error
const FieldModal: React.FC<{
  selectedField: Field | null;
  budget: number;
  onPhaseOut: (fieldName: string) => void;
  onClose: () => void;
}> = ({ selectedField, budget, onPhaseOut, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  if (!selectedField) {
    return null;
  }

  const canAfford = budget >= selectedField.phaseOutCost;

  // Handle background click to close modal
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Auto-scroll to modal when it opens
  useEffect(() => {
    if (modalRef.current) {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        modalRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [selectedField?.name]); // Re-run when field changes

  return (
    <div
      className="modal field-modal"
      ref={modalRef}
      onClick={handleBackgroundClick}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="modal-close-button"
          aria-label="Lukk modal"
        >
          &times;
        </button>

        <h2
          style={{
            marginTop: "8px",
            marginBottom: "20px",
            color: selectedField.status === "closed" ? "#10B981" : "#1F2937",
          }}
        >
          {selectedField.status === "closed" ? "🌱" : "🛢️"} {selectedField.name}
        </h2>

        <div className="field-details">
          <p>
            <strong>Status:</strong>
            <span className={`status-${selectedField.status}`}>
              {selectedField.status === "active"
                ? "Aktiv"
                : selectedField.status === "closed"
                  ? "Faset ut"
                  : "Overgangsfase"}
            </span>
          </p>

          {selectedField.status === "active" ? (
            <>
              <p>
                <strong>Årlig produksjon:</strong>
                <span>{selectedField.production.toFixed(1)} mill. boe</span>
              </p>
              <p>
                <strong>Årlige utslipp:</strong>
                <span style={{ color: "#DC2626", fontWeight: "bold" }}>
                  {selectedField.emissions[0].toFixed(1)} Mt CO₂
                </span>
              </p>
              <p>
                <strong>Utslippsintensitet:</strong>
                <span>{selectedField.intensity.toFixed(1)} kg CO₂/boe</span>
              </p>
              <p>
                <strong>Arbeidsplasser:</strong>
                <span>~{selectedField.workers.toLocaleString()}</span>
              </p>
              <p>
                <strong>Omstillingspotensial:</strong>
                <span style={{ color: "#059669", fontWeight: "bold" }}>
                  {selectedField.transitionPotential.replace("_", " ")}
                </span>
              </p>

              <hr />

              <div className="cost">
                <strong>💥 Totalt livstidsutslipp ved forbrenning:</strong>
                <div
                  style={{
                    fontSize: "1.2em",
                    color: "#DC2626",
                    marginTop: "8px",
                  }}
                >
                  {(selectedField.totalLifetimeEmissions / 1000).toFixed(0)} Mt
                  CO₂
                </div>
                <small style={{ opacity: 0.8 }}>
                  Dette er CO₂ som slippes ut når oljen brennes av forbrukere
                </small>
              </div>

              <div className="cost">
                <strong>💰 Kostnad for utfasing:</strong>
                <div style={{ fontSize: "1.2em", marginTop: "8px" }}>
                  {selectedField.phaseOutCost.toLocaleString()} mrd NOK
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "20px" }}>
              <div style={{ fontSize: "3em", marginBottom: "16px" }}>🌱</div>
              <p
                style={{
                  color: "#10B981",
                  fontSize: "1.2em",
                  fontWeight: "bold",
                }}
              >
                Dette feltet er allerede faset ut!
              </p>
              <p style={{ color: "#6B7280", marginTop: "8px" }}>
                Du hindrer nå{" "}
                {(selectedField.totalLifetimeEmissions / 1000).toFixed(0)} Mt
                CO₂ fra å bli sluppet ut i atmosfæren.
              </p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          {selectedField.status === "active" ? (
            <>
              <button
                onClick={() => onPhaseOut(selectedField.name)}
                disabled={!canAfford}
                className="phase-out-button"
              >
                {canAfford
                  ? `🌱 Fase ut feltet (${selectedField.phaseOutCost.toLocaleString()} mrd NOK)`
                  : `💰 Ikke nok penger (${selectedField.phaseOutCost.toLocaleString()} mrd NOK)`}
              </button>
              {!canAfford && (
                <div className="budget-warning">
                  Du mangler{" "}
                  {(selectedField.phaseOutCost - budget).toLocaleString()} mrd
                  NOK
                </div>
              )}
            </>
          ) : (
            <button
              onClick={onClose}
              className="phase-out-button"
              style={{ background: "#10B981" }}
            >
              ✅ Forstått
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Types ---
type Investment =
  | "green_tech"
  | "ai_research"
  | "renewable_energy"
  | "carbon_capture"
  | "foreign_cloud";

type Field = {
  name: string;
  lon: number;
  lat: number;
  emissions: number[];
  intensity: number;
  status: "active" | "closed" | "transitioning";
  production: number;
  workers: number;
  phaseOutCost: number;
  // Add real data fields
  productionOil?: number;
  productionGas?: number;
  realEmission?: number;
  realEmissionIntensity?: number;
  yearlyRevenue: number;
  totalLifetimeEmissions: number; // 98% from burning, not production
  transitionPotential: "wind" | "solar" | "data_center" | "research_hub";
  combustionEmission: number; // Scope 3
};

type ViewMode = "map" | "emissions" | "production" | "economics";

type DataLayer = "basic" | "intermediate" | "advanced" | "expert";

type GameState = {
  gameFields: Field[];
  budget: number;
  score: number;
  year: number;
  selectedField: Field | null;
  showFieldModal: boolean;
  achievements: string[];
  totalEmissions: number;
  totalProduction: number;
  shutdowns: ShutdownMap;
  realData: OilFieldDataset;
  currentView: ViewMode;
  investments: Record<Investment, number>;
  globalTemperature: number; // Track climate impact
  norwayTechRank: number; // Track Norway's tech independence
  foreignDependency: number; // How much we pay to foreign cloud providers
  climateDamage: number; // Cost of climate damage
  sustainabilityScore: number;
  playerChoices: string[]; // Track player decisions for education
  dataLayerUnlocked: DataLayer;
  saturationLevel: number; // 0-100, affects visual desaturation
  gamePhase:
    | "learning"
    | "action"
    | "crisis"
    | "victory"
    | "defeat"
    | "partial_success";
  tutorialStep: number;
  shownFacts: string[];
  badChoiceCount: number;
  goodChoiceStreak: number;
  selectedFields: Field[]; // For multi-select
  currentEvent?: any;
  showEventModal: boolean;
  showAchievementModal: boolean;
  showGameOverModal: boolean;
  newAchievements: string[];
  nextPhaseOutDiscount?: number;
  multiPhaseOutMode: boolean;
  yearlyPhaseOutCapacity: number; // How many fields can be phased out per year
  showBudgetWarning?: boolean;
  budgetWarningMessage?: string;
  totalCombustionEmissions: number;
};

type GameAction =
  | { type: "PHASE_OUT_FIELD"; payload: string }
  | { type: "SET_SELECTED_FIELD"; payload: Field | null }
  | { type: "TOGGLE_FIELD_MODAL"; payload: boolean }
  | { type: "UPDATE_EMISSIONS_PRODUCTION" }
  | { type: "LOAD_GAME_STATE"; payload: GameState }
  | { type: "ADD_ACHIEVEMENT"; payload: string }
  | { type: "ADVANCE_YEAR"; payload?: number }
  | { type: "SET_VIEW_MODE"; payload: ViewMode }
  | { type: "MAKE_INVESTMENT"; payload: { type: Investment; amount: number } }
  | {
      type: "TRANSITION_FIELD";
      payload: {
        fieldName: string;
        newType: "wind" | "solar" | "data_center" | "research_hub";
      };
    }
  | { type: "UPDATE_CLIMATE_METRICS" }
  | { type: "ADVANCE_TUTORIAL" }
  | { type: "SKIP_TUTORIAL" }
  | { type: "RESTART_GAME" }
  | { type: "RESET_TUTORIAL" }
  | { type: "TOGGLE_MULTI_SELECT" }
  | { type: "SELECT_FIELD_FOR_MULTI"; payload: Field }
  | { type: "DESELECT_FIELD_FROM_MULTI"; payload: string }
  | { type: "PHASE_OUT_SELECTED_FIELDS" }
  | { type: "CLEAR_SELECTED_FIELDS" }
  | { type: "HANDLE_EVENT"; payload: { eventId: string; choice: string } }
  | { type: "CLOSE_ACHIEVEMENT_MODAL" }
  | { type: "CLOSE_EVENT_MODAL" }
  | { type: "CLOSE_GAME_OVER_MODAL" }
  | { type: "ADVANCE_YEAR_MANUALLY" };

// --- Constants ---
const LOCAL_STORAGE_KEY = "phaseOutGameState";
const LOCAL_STORAGE_THEME_KEY = "userPreferredTheme";
const ACHIEVEMENT_FIRST_PHASE_OUT = "First Phase Out";

// Oil field coordinates (approximate Norwegian Continental Shelf positions)
const FIELD_COORDINATES: Record<string, { lon: number; lat: number }> = {
  "Aasta Hansteen": { lon: 6.8, lat: 65.1 },
  Alvheim: { lon: 2.1, lat: 56.5 },
  Balder: { lon: 2.8, lat: 56.3 },
  Brage: { lon: 2.4, lat: 60.5 },
  Draugen: { lon: 7.8, lat: 64.3 },
  "Edvard Grieg": { lon: 2.1, lat: 56.1 },
  Ekofisk: { lon: 3.2, lat: 56.5 },
  Eldfisk: { lon: 3.3, lat: 56.3 },
  Gjøa: { lon: 3.9, lat: 61.0 },
  Goliat: { lon: 22.2, lat: 71.1 },
  Grane: { lon: 2.8, lat: 59.1 },
  Gullfaks: { lon: 2.5, lat: 61.2 },
  Heidrun: { lon: 7.3, lat: 65.3 },
  "Johan Castberg": { lon: 19.0, lat: 71.6 },
  "Johan Sverdrup": { lon: 2.8, lat: 56.1 },
  Kristin: { lon: 6.6, lat: 65.0 },
  Kvitebjørn: { lon: 2.5, lat: 61.1 },
  "Martin Linge": { lon: 3.3, lat: 60.8 },
  Njord: { lon: 6.6, lat: 64.8 },
  Norne: { lon: 8.1, lat: 66.0 },
  "Ormen Lange": { lon: 6.3, lat: 63.4 },
  Oseberg: { lon: 2.8, lat: 60.8 },
  Skarv: { lon: 7.5, lat: 65.5 },
  Sleipner: { lon: 2.9, lat: 58.4 },
  Snorre: { lon: 2.2, lat: 61.4 },
  Snøhvit: { lon: 21.3, lat: 71.6 },
  Statfjord: { lon: 1.8, lat: 61.8 },
  Troll: { lon: 3.7, lat: 60.6 },
  Ula: { lon: 2.8, lat: 57.1 },
  Valhall: { lon: 3.4, lat: 56.3 },
  Visund: { lon: 2.4, lat: 61.4 },
  Yme: { lon: 2.2, lat: 58.1 },
  Åsgard: { lon: 7.0, lat: 65.2 },
};

const INITIAL_BUDGET = 15000; // 15 trillion NOK (closer to actual Oil Fund size)
const INITIAL_SCORE = 0; // Start from zero
const INITIAL_YEAR = 2025;
const DEFAULT_MAP_CENTER = [5, 62];
const DEFAULT_MAP_ZOOM = 6;

// --- Utility Functions ---
const createFieldFromRealData = (
  fieldName: string,
  realData: OilFieldDataset,
): Field => {
  const yearlyData = realData[fieldName];
  const latestYear = Math.max(...Object.keys(yearlyData).map(Number));
  const latestData = yearlyData[latestYear.toString()];

  const coordinates = FIELD_COORDINATES[fieldName] || { lon: 5, lat: 62 };

  // Calculate emissions history (last 5 years)
  const emissionsHistory = Object.keys(yearlyData)
    .map(Number)
    .sort((a, b) => b - a)
    .slice(0, 5)
    .map((year) => (yearlyData[year.toString()]?.emission || 0) / 1000); // Convert to Mt

  const currentProduction =
    (latestData?.productionOil || 0) + (latestData?.productionGas || 0);

  // Calculate more realistic lifetime emissions based on actual data
  const yearlyEmissionMt = (latestData?.emission || 0) / 1000;
  const estimatedLifetimeYears = 15; // Average field lifetime
  // Use actual emission intensity from data instead of arbitrary multiplier
  const totalLifetimeEmissions = yearlyEmissionMt * estimatedLifetimeYears;

  // Calculate more realistic phase-out cost based on production and field size
  // Base cost on production volume, with minimum cost for smaller fields
  const baseCostPerBoe = 15; // More realistic cost estimate (15 billion per million boe)
  const phaseOutCost = Math.max(
    5,
    Math.floor(currentProduction * baseCostPerBoe),
  );

  // More realistic revenue calculation based on actual oil prices
  // Current oil price ~80 USD/barrel, ~6.3 barrels per boe
  const oilPriceUSD = 80;
  const exchangeRate = 10; // USD to NOK
  const revenuePerBoe = (oilPriceUSD * 6.3 * exchangeRate) / 1000; // Convert to thousands NOK
  const yearlyRevenue = Math.floor(currentProduction * revenuePerBoe * 1000); // Convert to millions NOK

  // Assign transition potential based on location and field type
  let transitionPotential: "wind" | "solar" | "data_center" | "research_hub" =
    "wind";
  if (coordinates.lat > 70)
    transitionPotential = "wind"; // Northern fields good for wind
  else if (coordinates.lat < 58)
    transitionPotential = "solar"; // Southern fields good for solar
  else if (currentProduction > 5)
    transitionPotential = "data_center"; // Large fields for data centers
  else transitionPotential = "research_hub"; // Smaller fields for research

  return {
    name: fieldName,
    lon: coordinates.lon,
    lat: coordinates.lat,
    emissions: emissionsHistory.length > 0 ? emissionsHistory : [0],
    intensity: latestData?.emissionIntensity || 0,
    status: "active", // Always start as active, let user phase out
    production: currentProduction,
    workers: Math.floor(currentProduction * 50), // More realistic worker estimate
    phaseOutCost,
    productionOil: latestData?.productionOil,
    productionGas: latestData?.productionGas,
    realEmission: latestData?.emission,
    realEmissionIntensity: latestData?.emissionIntensity,
    yearlyRevenue,
    totalLifetimeEmissions,
    transitionPotential,
    combustionEmission: currentProduction * 2.6, // 2.6 tons of CO₂ per boe, approximate
  };
};

const loadGameState = (): GameState => {
  // Check if localStorage is available
  if (typeof window === "undefined" || !window.localStorage) {
    console.warn("localStorage not available");
    // Fallback to default state
  }

  const realData = generateCompleteData(data);
  const gameFields = Object.keys(realData).map((fieldName) =>
    createFieldFromRealData(fieldName, realData),
  );

  const defaultState: GameState = {
    gameFields,
    budget: INITIAL_BUDGET,
    score: INITIAL_SCORE,
    year: INITIAL_YEAR,
    selectedField: null,
    showFieldModal: false,
    achievements: [],
    totalEmissions: 0,
    totalProduction: 0,
    shutdowns: {},
    realData,
    currentView: "map",
    investments: {
      green_tech: 0,
      ai_research: 0,
      renewable_energy: 0,
      carbon_capture: 0,
      foreign_cloud: 0,
    },
    globalTemperature: 1.1,
    norwayTechRank: 0,
    foreignDependency: 0,
    climateDamage: 0,
    sustainabilityScore: 100,
    playerChoices: [],
    dataLayerUnlocked: "basic",
    saturationLevel: 100,
    gamePhase: "learning",
    tutorialStep: 0,
    shownFacts: [],
    badChoiceCount: 0,
    goodChoiceStreak: 0,
    selectedFields: [],
    currentEvent: undefined,
    showEventModal: false,
    showAchievementModal: false,
    showGameOverModal: false,
    newAchievements: [],
    nextPhaseOutDiscount: undefined,
    multiPhaseOutMode: false,
    yearlyPhaseOutCapacity: 0,
    totalCombustionEmissions: 0,
  };

  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    console.log(
      "Loading game state from localStorage:",
      saved ? "found" : "not found",
    );
    if (saved) {
      const parsed = JSON.parse(saved);
      console.log("Parsed saved state:", {
        hasGameFields: !!parsed.gameFields,
        gameFieldsCount: parsed.gameFields?.length,
        hasShutdowns: !!parsed.shutdowns,
        shutdownsCount: Object.keys(parsed.shutdowns || {}).length,
        savedFieldStatuses: parsed.gameFields?.map((f: any) => ({
          name: f.name,
          status: f.status,
        })),
      });

      if (parsed && typeof parsed === "object") {
        // Build field status map from saved data
        const savedFieldStatuses = new Map<
          string,
          "active" | "closed" | "transitioning"
        >();

        // Extract field statuses from saved gameFields array
        if (parsed.gameFields && Array.isArray(parsed.gameFields)) {
          parsed.gameFields.forEach((savedField: any) => {
            if (savedField && savedField.name && savedField.status) {
              const status = savedField.status as
                | "active"
                | "closed"
                | "transitioning";
              if (["active", "closed", "transitioning"].includes(status)) {
                savedFieldStatuses.set(savedField.name, status);
                console.log(
                  `Found saved field: ${savedField.name} = ${status}`,
                );
              }
            }
          });
        }

        // Also extract from shutdowns object (backup method)
        if (parsed.shutdowns && typeof parsed.shutdowns === "object") {
          Object.keys(parsed.shutdowns).forEach((fieldName) => {
            if (!savedFieldStatuses.has(fieldName)) {
              savedFieldStatuses.set(fieldName, "closed");
              console.log(`Found field in shutdowns: ${fieldName} = closed`);
            }
          });
        }

        console.log("Total saved field statuses:", savedFieldStatuses.size);

        // Create merged state with proper field statuses
        const mergedState: GameState = {
          ...defaultState,
          // Restore all saved values
          budget:
            typeof parsed.budget === "number"
              ? parsed.budget
              : defaultState.budget,
          score:
            typeof parsed.score === "number"
              ? parsed.score
              : defaultState.score,
          year:
            typeof parsed.year === "number" ? parsed.year : defaultState.year,
          achievements: Array.isArray(parsed.achievements)
            ? parsed.achievements
            : defaultState.achievements,
          shutdowns:
            parsed.shutdowns && typeof parsed.shutdowns === "object"
              ? parsed.shutdowns
              : defaultState.shutdowns,
          investments:
            parsed.investments && typeof parsed.investments === "object"
              ? parsed.investments
              : defaultState.investments,
          globalTemperature:
            typeof parsed.globalTemperature === "number"
              ? parsed.globalTemperature
              : defaultState.globalTemperature,
          norwayTechRank:
            typeof parsed.norwayTechRank === "number"
              ? parsed.norwayTechRank
              : defaultState.norwayTechRank,
          foreignDependency:
            typeof parsed.foreignDependency === "number"
              ? parsed.foreignDependency
              : defaultState.foreignDependency,
          climateDamage:
            typeof parsed.climateDamage === "number"
              ? parsed.climateDamage
              : defaultState.climateDamage,
          sustainabilityScore:
            typeof parsed.sustainabilityScore === "number"
              ? parsed.sustainabilityScore
              : defaultState.sustainabilityScore,
          playerChoices: Array.isArray(parsed.playerChoices)
            ? parsed.playerChoices
            : defaultState.playerChoices,
          dataLayerUnlocked:
            parsed.dataLayerUnlocked || defaultState.dataLayerUnlocked,
          saturationLevel:
            typeof parsed.saturationLevel === "number"
              ? parsed.saturationLevel
              : defaultState.saturationLevel,
          gamePhase: parsed.gamePhase || defaultState.gamePhase,
          tutorialStep:
            typeof parsed.tutorialStep === "number"
              ? parsed.tutorialStep
              : defaultState.tutorialStep,
          shownFacts: Array.isArray(parsed.shownFacts)
            ? parsed.shownFacts
            : defaultState.shownFacts,
          badChoiceCount:
            typeof parsed.badChoiceCount === "number"
              ? parsed.badChoiceCount
              : defaultState.badChoiceCount,
          goodChoiceStreak:
            typeof parsed.goodChoiceStreak === "number"
              ? parsed.goodChoiceStreak
              : defaultState.goodChoiceStreak,
          currentView: parsed.currentView || defaultState.currentView,
          multiPhaseOutMode:
            typeof parsed.multiPhaseOutMode === "boolean"
              ? parsed.multiPhaseOutMode
              : defaultState.multiPhaseOutMode,
          yearlyPhaseOutCapacity:
            typeof parsed.yearlyPhaseOutCapacity === "number"
              ? parsed.yearlyPhaseOutCapacity
              : defaultState.yearlyPhaseOutCapacity,

          // Apply saved field statuses to fresh field data
          gameFields: gameFields.map((field) => {
            const savedStatus = savedFieldStatuses.get(field.name);
            if (savedStatus) {
              console.log(
                `Applying saved status to ${field.name}: ${savedStatus}`,
              );
              return { ...field, status: savedStatus };
            }
            return field;
          }),

          // Restore selected fields with proper status
          selectedFields: Array.isArray(parsed.selectedFields)
            ? parsed.selectedFields
                .map((savedField: any) => {
                  const baseField = gameFields.find(
                    (f) => f.name === savedField.name,
                  );
                  if (baseField) {
                    const savedStatus =
                      savedFieldStatuses.get(savedField.name) ||
                      savedField.status;
                    return { ...baseField, status: savedStatus };
                  }
                  return null;
                })
                .filter(Boolean)
            : defaultState.selectedFields,
        };

        console.log("Final merged state:", {
          totalFields: mergedState.gameFields.length,
          closedFields: mergedState.gameFields.filter(
            (f: Field) => f.status === "closed",
          ).length,
          activeFields: mergedState.gameFields.filter(
            (f: Field) => f.status === "active",
          ).length,
          shutdownsCount: Object.keys(mergedState.shutdowns).length,
          year: mergedState.year,
          budget: mergedState.budget,
          achievements: mergedState.achievements.length,
        });

        return mergedState;
      }
    }
  } catch (e) {
    console.error("Failed to load game state:", e);
    // If there's any error loading the saved state, clear it and start fresh
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }

  console.log("Using default state");
  return defaultState;
};

// Game restart utility
const createFreshGameState = (): GameState => {
  const realData = generateCompleteData(data);
  const gameFields = Object.keys(realData).map((fieldName) =>
    createFieldFromRealData(fieldName, realData),
  );

  return {
    gameFields,
    budget: INITIAL_BUDGET,
    score: INITIAL_SCORE,
    year: INITIAL_YEAR,
    selectedField: null,
    showFieldModal: false,
    achievements: [],
    totalEmissions: 0,
    totalProduction: 0,
    shutdowns: {},
    realData,
    currentView: "map",
    investments: {
      green_tech: 0,
      ai_research: 0,
      renewable_energy: 0,
      carbon_capture: 0,
      foreign_cloud: 0,
    },
    globalTemperature: 1.1,
    norwayTechRank: 0,
    foreignDependency: 0,
    climateDamage: 0,
    sustainabilityScore: 100,
    playerChoices: [],
    dataLayerUnlocked: "basic",
    saturationLevel: 100,
    gamePhase: "learning",
    tutorialStep: 0,
    shownFacts: [],
    badChoiceCount: 0,
    goodChoiceStreak: 0,
    selectedFields: [],
    currentEvent: undefined,
    showEventModal: false,
    showAchievementModal: false,
    showGameOverModal: false,
    newAchievements: [],
    nextPhaseOutDiscount: undefined,
    multiPhaseOutMode: false,
    yearlyPhaseOutCapacity: 0,
    totalCombustionEmissions: 0,
  };
};

const getColorForIntensity = (
  intensity: number,
  status: Field["status"],
): string => {
  if (status === "closed") return "#10B981";
  if (status === "transitioning") return "#F59E0B";
  if (intensity > 15) return "#EF4444";
  if (intensity > 8) return "#F97316";
  if (intensity > 3) return "#EAB308";
  return "#22C55E";
};

// Enhanced badge system with educational messages
const ACHIEVEMENT_BADGES = {
  FIRST_STEPS: {
    emoji: "👶",
    title: "Første Skritt",
    desc: "Faset ut ditt første oljefelt",
  },
  CLIMATE_AWARE: {
    emoji: "🌡️",
    title: "Klimabevisst",
    desc: "Holdt temperaturstigningen under 1.5°C",
  },
  TECH_PIONEER: {
    emoji: "🚀",
    title: "Tech-Pioner",
    desc: "Investerte 100+ mrd i norsk teknologi",
  },
  GREEN_TRANSITION: {
    emoji: "🌱",
    title: "Grønn Omstilling",
    desc: "Konverterte 5+ felt til fornybar energi",
  },
  INDEPENDENCE_HERO: {
    emoji: "🇳🇴",
    title: "Uavhengighets-Helt",
    desc: "Nådde 80%+ teknologisk selvstendighet",
  },
  PLANET_SAVER: {
    emoji: "🌍",
    title: "Planet-Redder",
    desc: "Hindret 500+ Mt CO₂ fra å bli brent",
  },
  ECONOMIC_GENIUS: {
    emoji: "💰",
    title: "Økonomi-Geni",
    desc: "Opprettholdt 1000+ mrd i budsjett",
  },
  FUTURE_BUILDER: {
    emoji: "🏗️",
    title: "Fremtidsbygger",
    desc: "Vant spillet med perfekt balanse",
  },
  CLIMATE_FAILURE: {
    emoji: "🔥",
    title: "Klimakatastrofe",
    desc: "Lot temperaturen stige over 2°C",
  },
  TECH_DEPENDENT: {
    emoji: "🔗",
    title: "Tech-Avhengig",
    desc: "Ble for avhengig av utenlandsk teknologi",
  },
  SHORT_SIGHTED: {
    emoji: "💸",
    title: "Kortsiktig",
    desc: "Prioriterte profitt over planet",
  },
};

// Try to import badge components, fallback if they don't exist
let BadgeComponents: Record<string, React.ComponentType> = {};
try {
  const badges = require("../../components/badges/BadgeShowcase");
  BadgeComponents = {
    "Første Skritt": badges.FirstSteps,
    Klimabevisst: badges.ClimateAware,
    "Tech-Pioner": badges.TechPioneer,
    "Grønn Omstilling": badges.GreenTransition,
    "Uavhengighets-Helt": badges.IndependenceHero,
    "Planet-Redder": badges.PlanetSaver,
    "Økonomi-Geni": badges.EconomicGenius,
    Fremtidsbygger: badges.FutureBuilder,
    Klimakatastrofe: badges.ClimateFailure,
    "Tech-Avhengig": badges.TechDependent,
    Kortsiktig: badges.ShortSighted,
  };
} catch (e) {
  console.log("Badge components not found, using fallback display");
}

// Environmental consequences system
const calculateEnvironmentalState = (gameState: GameState) => {
  const temp = gameState.globalTemperature;
  const activeFields = gameState.gameFields.filter(
    (f) => f.status === "active",
  ).length;
  const totalFields = gameState.gameFields.length;

  if (temp > 2.5)
    return {
      phase: "crisis",
      saturation: 20,
      message: "🔥 KLIMAKATASTROFE! Verden brenner!",
    };
  if (temp > 2.0)
    return {
      phase: "danger",
      saturation: 40,
      message: "⚠️ KRITISK! Temperaturen stiger farlig!",
    };
  if (temp > 1.5)
    return {
      phase: "warning",
      saturation: 70,
      message: "⚡ ADVARSEL! Klimamålene er i fare!",
    };
  if (activeFields / totalFields < 0.3)
    return {
      phase: "victory",
      saturation: 100,
      message: "🌟 FANTASTISK! Du redder verden!",
    };

  return {
    phase: "normal",
    saturation: 85,
    message: "🎯 Fortsett arbeidet for klimaet!",
  };
};

// Progressive UI component that reveals data based on player progress
const ProgressiveDataPanel: React.FC<{
  gameState: GameState;
  layer: DataLayer;
}> = ({ gameState, layer }) => {
  const showBasic = ["basic", "intermediate", "advanced", "expert"].includes(
    layer,
  );
  const showIntermediate = ["intermediate", "advanced", "expert"].includes(
    layer,
  );
  const showAdvanced = ["advanced", "expert"].includes(layer);
  const showExpert = layer === "expert";

  return (
    <div className="progressive-data-panel">
      {showBasic && (
        <div className="data-layer basic">
          <h4>📊 Grunnleggende Data</h4>
          <div className="data-grid">
            <div className="data-item">
              <span>Aktive felt:</span>
              <span>
                {
                  gameState.gameFields.filter((f) => f.status === "active")
                    .length
                }
              </span>
            </div>
            <div className="data-item">
              <span>Utslipp per år:</span>
              <span>{gameState.totalEmissions.toFixed(1)} Mt</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Game Control Panel Component
const GameControlPanel: React.FC<{
  gameState: GameState;
  dispatch: Function;
}> = ({ gameState, dispatch }) => {
  const handleRestart = () => {
    if (
      window.confirm(
        "Er du sikker på at du vil starte spillet på nytt? All fremgang vil gå tapt.",
      )
    ) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      dispatch({ type: "RESTART_GAME" });
    }
  };

  const handleResetTutorial = () => {
    dispatch({ type: "RESET_TUTORIAL" });
  };

  const handleClearStorage = () => {
    if (window.confirm("Er du sikker på at du vil slette all lagret data?")) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      window.location.reload();
    }
  };

  const handleTestStorage = () => {
    console.log("=== localStorage Test ===");

    // Test 1: Basic localStorage functionality
    try {
      localStorage.setItem("test-basic", "hello");
      const basicTest = localStorage.getItem("test-basic");
      console.log("Basic test:", basicTest === "hello" ? "PASS" : "FAIL");
      localStorage.removeItem("test-basic"); // Clean up
    } catch (e) {
      console.log("Basic test: FAIL -", e);
    }

    // Test 2: JSON functionality
    try {
      const testData = { test: "data", timestamp: Date.now() };
      localStorage.setItem("test-json", JSON.stringify(testData));
      const retrieved = localStorage.getItem("test-json");
      const parsed = JSON.parse(retrieved || "{}");
      console.log(
        "JSON test:",
        parsed.test === "data" ? "PASS" : "FAIL",
        parsed,
      );
      localStorage.removeItem("test-json"); // Clean up
    } catch (e) {
      console.log("JSON test: FAIL -", e);
    }

    // Test 3: QuotaExceededError (simulated, or check for available space)
    try {
      // Attempt to store a very large item to potentially trigger an error
      // This might not always work depending on browser and available space
      const largeData = "a".repeat(5 * 1024 * 1024); // 5MB string
      localStorage.setItem("test-large", largeData);
      console.log("Large data test: PASS (no quota error)");
      localStorage.removeItem("test-large"); // Clean up
    } catch (e: any) {
      // Type 'any' used here for demonstration purposes, consider more specific error handling
      if (e.name === "QuotaExceededError") {
        console.log("Large data test: FAIL - QuotaExceededError (Expected)");
      } else {
        console.log("Large data test: FAIL -", e);
      }
    }

    console.log("=== localStorage Test Complete ===");
  };

  return (
    <div className="game-control-panel">
      <h3>Kontrollpanel</h3>
      <button onClick={handleRestart}>Start på nytt</button>
      <button onClick={handleResetTutorial}>Tilbakestill veiledning</button>
      <button onClick={handleClearStorage}>Slett lagret data</button>
      <button onClick={handleTestStorage}>Test Lagring</button>
    </div>
  );
};

// Updated main component - ensure it's properly exported
const MapPage: React.FC = () => {
  // ...existing code...
  return <></>;
};

// Make sure this is the only default export at the end of the file
export default MapPage;
