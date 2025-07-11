import React, { useEffect, useRef, useState, useReducer, useCallback, useMemo } from "react";
import Map from "ol/Map";
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

// --- Types ---
type Investment = "green_tech" | "ai_research" | "renewable_energy" | "carbon_capture" | "foreign_cloud";

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
  gamePhase: "learning" | "action" | "crisis" | "victory" | "defeat";
  tutorialStep: number;
  shownFacts: string[];
  badChoiceCount: number;
  goodChoiceStreak: number;
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
  | { type: "TRANSITION_FIELD"; payload: { fieldName: string; newType: "wind" | "solar" | "data_center" | "research_hub" } }
  | { type: "UPDATE_CLIMATE_METRICS" }
  | { type: "ADVANCE_TUTORIAL" }
  | { type: "SKIP_TUTORIAL" };

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

const INITIAL_BUDGET = 500;
const INITIAL_SCORE = 100;
const INITIAL_YEAR = 2025;
const DEFAULT_MAP_CENTER = [5, 62];
const DEFAULT_MAP_ZOOM = 6;

// --- Utility Functions ---
const createFieldFromRealData = (fieldName: string, realData: OilFieldDataset): Field => {
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

  const currentProduction = (latestData?.productionOil || 0) + (latestData?.productionGas || 0);

  // Calculate more realistic lifetime emissions
  const yearlyEmissionMt = (latestData?.emission || 0) / 1000;
  const estimatedLifetimeYears = 15; // Average field lifetime
  const totalLifetimeEmissions = yearlyEmissionMt * estimatedLifetimeYears * 49; // 98% from burning (49x more than production)

  // Assign transition potential based on location and field type
  let transitionPotential: "wind" | "solar" | "data_center" | "research_hub" = "wind";
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
    status: currentProduction > 0 ? "active" : "closed",
    production: currentProduction,
    workers: Math.floor(currentProduction * 25), // Estimate workers
    phaseOutCost: Math.floor(currentProduction * 10), // Estimate phase-out cost
    productionOil: latestData?.productionOil,
    productionGas: latestData?.productionGas,
    realEmission: latestData?.emission,
    realEmissionIntensity: latestData?.emissionIntensity,
    yearlyRevenue: currentProduction * 2000, // More realistic revenue estimate
    totalLifetimeEmissions,
    transitionPotential,
  };
};

const loadGameState = (): GameState => {
  const realData = generateCompleteData(data);
  const gameFields = Object.keys(realData).map((fieldName) => createFieldFromRealData(fieldName, realData));

  // Default state with all new properties
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
  };

  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.gameFields) {
        // Merge saved state with default state to ensure all properties exist
        return {
          ...defaultState,
          ...parsed,
          realData,
          gameFields: gameFields.map((field) => {
            const savedField = parsed.gameFields.find((f: Field) => f.name === field.name);
            return savedField ? { ...field, status: savedField.status } : field;
          }),
          // Ensure new properties have default values if not in saved state
          investments: parsed.investments || defaultState.investments,
          globalTemperature: parsed.globalTemperature ?? defaultState.globalTemperature,
          norwayTechRank: parsed.norwayTechRank ?? defaultState.norwayTechRank,
          foreignDependency: parsed.foreignDependency ?? defaultState.foreignDependency,
          climateDamage: parsed.climateDamage ?? defaultState.climateDamage,
          sustainabilityScore: parsed.sustainabilityScore ?? defaultState.sustainabilityScore,
          playerChoices: parsed.playerChoices || defaultState.playerChoices,
        };
      }
    }
  } catch (e) {
    console.error("Failed to load game state:", e);
  }

  return defaultState;
};

const getColorForIntensity = (intensity: number, status: Field["status"]): string => {
  if (status === "closed") return "#10B981";
  if (status === "transitioning") return "#F59E0B";
  if (intensity > 15) return "#EF4444";
  if (intensity > 8) return "#F97316";
  if (intensity > 3) return "#EAB308";
  return "#22C55E";
};

// Enhanced badge system with educational messages
const ACHIEVEMENT_BADGES = {
  FIRST_STEPS: { emoji: "👶", title: "Første Skritt", desc: "Faset ut ditt første oljefelt" },
  CLIMATE_AWARE: { emoji: "🌡️", title: "Klimabevisst", desc: "Holdt temperaturstigningen under 1.5°C" },
  TECH_PIONEER: { emoji: "🚀", title: "Tech-Pioner", desc: "Investerte 100+ mrd i norsk teknologi" },
  GREEN_TRANSITION: { emoji: "🌱", title: "Grønn Omstilling", desc: "Konverterte 5+ felt til fornybar energi" },
  INDEPENDENCE_HERO: { emoji: "🇳🇴", title: "Uavhengighets-Helt", desc: "Nådde 80%+ teknologisk selvstendighet" },
  PLANET_SAVER: { emoji: "🌍", title: "Planet-Redder", desc: "Hindret 500+ Mt CO₂ fra å bli brent" },
  ECONOMIC_GENIUS: { emoji: "💰", title: "Økonomi-Geni", desc: "Opprettholdt 1000+ mrd i budsjett" },
  FUTURE_BUILDER: { emoji: "🏗️", title: "Fremtidsbygger", desc: "Vant spillet med perfekt balanse" },

  // Failure badges (consequences)
  CLIMATE_FAILURE: { emoji: "🔥", title: "Klimakatastrofe", desc: "Lot temperaturen stige over 2°C" },
  TECH_DEPENDENT: { emoji: "🔗", title: "Tech-Avhengig", desc: "Ble for avhengig av utenlandsk teknologi" },
  SHORT_SIGHTED: { emoji: "💸", title: "Kortsiktig", desc: "Prioriterte profitt over planet" },
};

// Environmental consequences system
const calculateEnvironmentalState = (gameState: GameState) => {
  const temp = gameState.globalTemperature;
  const activeFields = gameState.gameFields.filter((f) => f.status === "active").length;
  const totalFields = gameState.gameFields.length;

  if (temp > 2.5) return { phase: "crisis", saturation: 20, message: "🔥 KLIMAKATASTROFE! Verden brenner!" };
  if (temp > 2.0) return { phase: "danger", saturation: 40, message: "⚠️ KRITISK! Temperaturen stiger farlig!" };
  if (temp > 1.5) return { phase: "warning", saturation: 70, message: "⚡ ADVARSEL! Klimamålene er i fare!" };
  if (activeFields / totalFields < 0.3) return { phase: "victory", saturation: 100, message: "🌟 FANTASTISK! Du redder verden!" };

  return { phase: "normal", saturation: 85, message: "🎯 Fortsett arbeidet for klimaet!" };
};

// Progressive UI component that reveals data based on player progress
const ProgressiveDataPanel: React.FC<{ gameState: GameState; layer: DataLayer }> = ({ gameState, layer }) => {
  const showBasic = ["basic", "intermediate", "advanced", "expert"].includes(layer);
  const showIntermediate = ["intermediate", "advanced", "expert"].includes(layer);
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
              <span>{gameState.gameFields.filter((f) => f.status === "active").length}</span>
            </div>
            <div className="data-item">
              <span>Utslipp per år:</span>
              <span>{gameState.totalEmissions.toFixed(1)} Mt</span>
            </div>
          </div>
        </div>
      )}

      {showIntermediate && (
        <div className="data-layer intermediate">
          <h4>🔍 Detaljert Analyse</h4>
          <div className="data-grid">
            <div className="data-item">
              <span>Utslippsintensitet gjennomsnitt:</span>
              <span>
                {(
                  gameState.gameFields.reduce((sum, f) => sum + f.intensity, 0) /
                  gameState.gameFields.length
                ).toFixed(1)}{" "}
                kg/boe
              </span>
            </div>
            <div className="data-item">
              <span>Fremtidig forbrenning:</span>
              <span>
                {gameState.gameFields
                  .filter((f) => f.status === "active")
                  .reduce((sum, f) => sum + f.totalLifetimeEmissions, 0)
                  .toFixed(0)}{" "}
                Mt
              </span>
            </div>
          </div>
        </div>
      )}

      {showAdvanced && (
        <div className="data-layer advanced">
          <h4>📈 Avansert Statistikk</h4>
          <div className="data-grid">
            <div className="data-item">
              <span>Teknologi-investeringer:</span>
              <span>{Object.values(gameState.investments).reduce((sum, inv) => sum + inv, 0)} mrd</span>
            </div>
            <div className="data-item">
              <span>Utenlandsavhengighet:</span>
              <span className={gameState.foreignDependency > 50 ? "warning" : "good"}>
                {gameState.foreignDependency}%
              </span>
            </div>
          </div>
        </div>
      )}

      {showExpert && (
        <div className="data-layer expert">
          <h4>🎓 Ekspert-Innsikt</h4>
          <div className="expert-insights">
            <p>
              💡 Med nåværende tempo vil Norge nå karbon-nøytralitet i{" "}
              {2040 + Math.floor(gameState.totalEmissions / 10)} år
            </p>
            <p>
              🏭 Gjennomsnittlig felt har{" "}
              {(gameState.gameFields.reduce((sum, f) => sum + f.workers, 0) / gameState.gameFields.length).toFixed(0)}{" "}
              arbeidere
            </p>
            <p>
              ⚡ Overgangspotensialet kan skape{" "}
              {gameState.gameFields.filter((f) => f.status === "closed").length * 200} nye grønne jobber
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Enhanced tutorial system
const TutorialOverlay: React.FC<{ step: number; onNext: () => void; onSkip: () => void }> = ({ step, onNext, onSkip }) => {
  const tutorials = [
    { title: "Velkommen til Phase Out Village! 🌍", text: "Du skal hjelpe Norge med å fase ut olje og bygge en bærekraftig fremtid.", highlight: ".header" },
    { title: "Se oljefeltene 🛢️", text: "Røde felt har høy utslippsintensitet. Grønne er 'renere'. Men husk: 98% av utslippene kommer fra FORBRENNING!", highlight: ".map-container" },
    { title: "Klikk for å fase ut 🌱", text: "Hver gang du faser ut et felt, hindrer du LIVSTID med CO₂-utslipp fra forbrenning!", highlight: ".map-div" },
    { title: "Invester i fremtiden 🚀", text: "Bruk pengene på norsk teknologi, ikke utenlandske sky-tjenester!", highlight: ".investment-panel" },
    { title: "Følg med på konsekvensene 🌡️", text: "Dårlige valg fører til temperaturstigning og visuell 'fade out'.", highlight: ".climate-dashboard" },
  ];

  if (step >= tutorials.length) return null;

  const current = tutorials[step];

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-popup">
        <h3>{current.title}</h3>
        <p>{current.text}</p>
        <div className="tutorial-buttons">
          <button onClick={onNext} className="tutorial-next">
            {step < tutorials.length - 1 ? "Neste" : "Start spillet!"}
          </button>
          <button onClick={onSkip} className="tutorial-skip">Hopp over</button>
        </div>
      </div>
    </div>
  );
};

// Gamification feedback system
const GameFeedback: React.FC<{ gameState: GameState }> = ({ gameState }) => {
  const envState = calculateEnvironmentalState(gameState);

  return (
    <div className={`game-feedback ${envState.phase}`}>
      <div className="feedback-message">{envState.message}</div>
      {gameState.goodChoiceStreak > 3 && (
        <div className="streak-bonus">🔥 {gameState.goodChoiceStreak} gode valg på rad!</div>
      )}
      {gameState.badChoiceCount > 2 && (
        <div className="warning-streak">⚠️ {gameState.badChoiceCount} dårlige valg - vær forsiktig!</div>
      )}
    </div>
  );
};

// --- Reducer ---
const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case "LOAD_GAME_STATE":
      return { ...state, ...action.payload };
    case "PHASE_OUT_FIELD": {
      const fieldName = action.payload;
      const field = state.gameFields.find((f) => f.name === fieldName);
      if (!field || state.budget < field.phaseOutCost) return state;

      // Calculate environmental impact
      const envState = calculateEnvironmentalState(state);
      const newDataLayer = state.score > 500 ? "expert" : state.score > 300 ? "advanced" : state.score > 100 ? "intermediate" : "basic";

      return {
        ...state,
        budget: state.budget - field.phaseOutCost,
        score: state.score + Math.floor(field.totalLifetimeEmissions / 1000), // Bonus for preventing burning
        globalTemperature: Math.max(1.1, state.globalTemperature - field.totalLifetimeEmissions / 1000000),
        gameFields: state.gameFields.map((f) => (f.name === fieldName ? { ...f, status: "closed" as const, production: 0 } : f)),
        playerChoices: [...state.playerChoices, `Faset ut ${fieldName} - Hindret ${(field.totalLifetimeEmissions / 1000).toFixed(0)} tonn CO2 fra å bli brent`],
        year: state.year + 1,
        dataLayerUnlocked: newDataLayer,
        goodChoiceStreak: state.goodChoiceStreak + 1,
        badChoiceCount: Math.max(0, state.badChoiceCount - 1),
        saturationLevel: envState.saturation,
        gamePhase: envState.phase as any,
      };
    }
    case "SET_SELECTED_FIELD":
      return { ...state, selectedField: action.payload };
    case "TOGGLE_FIELD_MODAL":
      return { ...state, showFieldModal: action.payload };
    case "UPDATE_EMISSIONS_PRODUCTION": {
      const emissions = state.gameFields.reduce((sum, field) => (field.status === "active" ? sum + field.emissions[0] : sum), 0);
      const production = state.gameFields.reduce((sum, field) => (field.status === "active" ? sum + field.production : sum), 0);
      return {
        ...state,
        totalEmissions: emissions,
        totalProduction: production,
      };
    }
    case "ADVANCE_YEAR":
      return { ...state, year: state.year + (action.payload || 1) };
    case "ADD_ACHIEVEMENT":
      if (!state.achievements.includes(action.payload)) {
        return {
          ...state,
          achievements: [...state.achievements, action.payload],
        };
      }
      return state;
    case "SET_VIEW_MODE":
      return { ...state, currentView: action.payload };
    case "MAKE_INVESTMENT": {
      const { type, amount } = action.payload;
      if (state.budget < amount) return state;

      const isBadChoice = type === "foreign_cloud";

      return {
        ...state,
        budget: state.budget - amount,
        badChoiceCount: isBadChoice ? state.badChoiceCount + 1 : state.badChoiceCount,
        goodChoiceStreak: isBadChoice ? 0 : state.goodChoiceStreak + 1,
        norwayTechRank: isBadChoice ? state.norwayTechRank - 3 : state.norwayTechRank + (type === "ai_research" ? 8 : 5),
        sustainabilityScore: isBadChoice ? state.sustainabilityScore - 10 : state.sustainabilityScore + 10,
        foreignDependency: isBadChoice ? state.foreignDependency + 15 : Math.max(0, state.foreignDependency - 10),
        playerChoices: [...state.playerChoices, `Investerte ${amount} mrd i ${type === "foreign_cloud" ? "utenlandsk cloud" : type === "ai_research" ? "AI-forskning" : "grønn teknologi"}`],
      };
    }
    case "UPDATE_CLIMATE_METRICS": {
      // Calculate climate damage costs
      const tempIncrease = state.globalTemperature - 1.1; // Above pre-industrial
      const climateCost = tempIncrease * 100; // 100 billion per degree

      return {
        ...state,
        climateDamage: climateCost,
        sustainabilityScore: Math.max(0, 100 - tempIncrease * 50),
      };
    }
    case "ADVANCE_TUTORIAL":
      return { ...state, tutorialStep: state.tutorialStep + 1 };
    case "SKIP_TUTORIAL":
      return { ...state, tutorialStep: 5 }; // Skip to end
    default:
      return state;
  }
};

// --- Field Modal Component ---
interface FieldModalProps {
  selectedField: Field | null;
  budget: number;
  onPhaseOut: (fieldName: string) => void;
  onClose: () => void;
}

const FieldModal: React.FC<FieldModalProps> = ({ selectedField, budget, onPhaseOut, onClose }) => {
  if (!selectedField) return null;

  const canPhaseOut = budget >= selectedField.phaseOutCost;
  const [showTransitionOptions, setShowTransitionOptions] = useState(false);

  return (
    <div className="modal">
      <div className="modal-content">
        <h3 className="modal-title">🛢️ {selectedField.name}</h3>

        {selectedField.status === "active" ? (
          <>
            <div className="modal-stats">
              <div className="modal-stat-row">
                <span>Årlig utslipp (produksjon):</span>
                <span className="modal-stat-value" style={{ color: "#F59E0B" }}>
                  {selectedField.emissions[0].toFixed(1)} Mt/år
                </span>
              </div>
              <div className="modal-stat-row">
                <span>💥 Totalt fra forbrenning:</span>
                <span className="modal-stat-value" style={{ color: "#DC2626" }}>
                  {(selectedField.totalLifetimeEmissions / 1000).toFixed(0)} Mt livstid
                </span>
              </div>
              <div className="modal-stat-row">
                <span>Overgangs-potensial:</span>
                <span className="modal-stat-value" style={{ color: "#10B981" }}>
                  {selectedField.transitionPotential === "wind" ? "🌬️ Vindkraft" : selectedField.transitionPotential === "data_center" ? "💻 Datasenter" : selectedField.transitionPotential === "research_hub" ? "🧠 Forskningshub" : "☀️ Solkraft"}
                </span>
              </div>
            </div>

            <div className="climate-warning">
              <p>⚠️ Hver dag dette feltet er aktivt, brennes mer olje og slipper ut CO₂!</p>
              <p>🌡️ Hindre forbrenning = redd klimaet</p>
            </div>

            <div className="modal-buttons">
              <button onClick={() => onPhaseOut(selectedField.name)} disabled={!canPhaseOut} className={`button-phase-out ${canPhaseOut ? "button-phase-out-enabled" : "button-phase-out-disabled"}`}>
                🌱 FASE UT & REDDE KLIMA
              </button>
              <button onClick={onClose} className="button-cancel">
                AVBRYT
              </button>
            </div>
          </>
        ) : (
          // Show transition success and options
          <div className="transition-success">
            <div className="closed-emoji">🌱</div>
            <p className="closed-text">Gratulerer! Du reddet klimaet!</p>
            <p className="closed-subtext">Hindret {(selectedField.totalLifetimeEmissions / 1000).toFixed(0)} Mt CO₂ fra å bli brent! 🎉</p>
            <button onClick={onClose} className="button-ok">
              FORTSETT Å REDDE VERDEN
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Investment Panel Component ---
const InvestmentPanel: React.FC<{ gameState: GameState; dispatch: Function }> = ({ gameState, dispatch }) => {
  const budget = gameState.budget ?? 0;

  return (
    <div className="investment-panel">
      <h3>🏦 Invester Norges Fremtid</h3>
      <div className="investment-options">
        <button onClick={() => dispatch({ type: "MAKE_INVESTMENT", payload: { type: "ai_research", amount: 50 } })} disabled={budget < 50} className="investment-button good-choice">
          🧠 AI-Forskning (50 mrd)
          <br />
          <small>Bygg lokal kompetanse</small>
        </button>
        <button onClick={() => dispatch({ type: "MAKE_INVESTMENT", payload: { type: "green_tech", amount: 30 } })} disabled={budget < 30} className="investment-button good-choice">
          ⚡ Grønn Tech (30 mrd)
          <br />
          <small>Fornybar energi</small>
        </button>
        <button onClick={() => dispatch({ type: "MAKE_INVESTMENT", payload: { type: "foreign_cloud", amount: 20 } })} disabled={budget < 20} className="investment-button bad-choice">
          ☁️ Utenlandsk Cloud (20 mrd)
          <br />
          <small>⚠️ Øker avhengighet</small>
        </button>
      </div>
    </div>
  );
};

// --- Climate Dashboard Component ---
const ClimateDashboard: React.FC<{ gameState: GameState }> = ({ gameState }) => {
  // Ensure we have valid values with fallbacks
  const temperature = gameState.globalTemperature ?? 1.1;
  const techRank = gameState.norwayTechRank ?? 0;

  return (
    <div className="climate-dashboard">
      <div className="climate-metric">
        <h4>🌡️ Global Temperatur</h4>
        <div className={`temp-display ${temperature > 2.0 ? "danger" : "safe"}`}>+{temperature.toFixed(1)}°C</div>
        {temperature > 2.0 && <p className="climate-warning">⚠️ FARLIG NIVÅ!</p>}
      </div>
      <div className="climate-metric">
        <h4>🇳🇴 Tech-Uavhengighet</h4>
        <div className="progress-bar-small">
          <div className="progress-fill-tech" style={{ width: `${Math.min(100, Math.max(0, techRank))}%` }} />
        </div>
        <span>{techRank}%</span>
      </div>
    </div>
  );
};

// --- Main Component ---
const PhaseOutMapPage: React.FC = () => {
  const [gameState, dispatch] = useReducer(gameReducer, loadGameState());
  const { gameFields, budget, score, year, selectedField, showFieldModal, achievements, totalEmissions, totalProduction, currentView } = gameState;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);

  // Save game state
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(gameState));
  }, [gameState]);

  // Update totals
  useEffect(() => {
    dispatch({ type: "UPDATE_EMISSIONS_PRODUCTION" });
  }, [gameFields]);

  // Initialize map only when in map view
  useEffect(() => {
    if (!mapRef.current || currentView !== "map") return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new Map({
        target: mapRef.current,
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://{a-c}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
              attributions: "&copy; OpenStreetMap contributors & Carto",
            }),
          }),
        ],
        view: new View({
          center: fromLonLat(DEFAULT_MAP_CENTER),
          zoom: DEFAULT_MAP_ZOOM,
        }),
        controls: [],
      });

      mapInstanceRef.current.on("singleclick", function (evt) {
        mapInstanceRef.current?.forEachFeatureAtPixel(evt.pixel, function (feature) {
          const fieldData = feature.get("fieldData");
          if (fieldData) {
            dispatch({ type: "SET_SELECTED_FIELD", payload: fieldData });
            dispatch({ type: "TOGGLE_FIELD_MODAL", payload: true });
          }
        });
      });
    }

    // Update map size when switching to map view
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.updateSize();
      }
    }, 100);

    const map = mapInstanceRef.current;
    let vectorLayer = map
      .getLayers()
      .getArray()
      .find((layer) => layer instanceof VectorLayer) as VectorLayer | undefined;

    const vectorSource = new VectorSource({
      features: gameFields.map((field) => {
        const feature = new Feature({
          geometry: new Point(fromLonLat([field.lon, field.lat])),
          name: field.name,
          fieldData: field,
        });

        const color = getColorForIntensity(field.intensity, field.status);
        const size = field.status === "closed" ? 8 : Math.max(8, Math.min(16, field.production * 0.5));

        feature.setStyle(
          new Style({
            image: new Circle({
              radius: size,
              fill: new Fill({ color: color }),
              stroke: new Stroke({ color: "#FFFFFF", width: 2 }),
            }),
            text: new Text({
              text: field.status === "closed" ? "🌱" : "🛢️",
              offsetY: -25,
              font: "16px sans-serif",
            }),
          })
        );
        return feature;
      }),
    });

    if (vectorLayer) {
      vectorLayer.setSource(vectorSource);
    } else {
      vectorLayer = new VectorLayer({ source: vectorSource });
      map.addLayer(vectorLayer);
    }

    return () => {
      if (mapInstanceRef.current && !mapRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
  }, [gameFields, currentView]);

  const phaseOutField = useCallback((fieldName: string) => {
    dispatch({ type: "PHASE_OUT_FIELD", payload: fieldName });
  }, []);

  const emissionsData = useMemo(() => {
    // Transform game data for emissions chart
    const years = Array.from({ length: year - 2020 + 1 }, (_, i) => 2020 + i);
    return gameFields.map((field) => ({
      name: field.name,
      data: years.map((y) => {
        // If field is closed and shutdown year is before current year, emissions = 0
        const shutdownYear = gameState.shutdowns[field.name];
        if (shutdownYear && y >= shutdownYear) {
          return 0;
        }
        // Use historical data or current emissions
        return field.emissions[0] || 0;
      }),
    }));
  }, [gameFields, year, gameState.shutdowns]);

  const renderCurrentView = () => {
    switch (currentView) {
      case "emissions":
        return (
          <div className="view-container">
            <EmissionsView data={emissionsData} />
            <div className="game-impact-summary">
              <h3>🎮 Din påvirkning</h3>
              <p>Totale utslipp redusert: {Object.keys(gameState.shutdowns).length * 2.5}Mt CO₂</p>
              <p>Felt faset ut: {Object.keys(gameState.shutdowns).length}</p>
            </div>
          </div>
        );
      case "map":
      default:
        return (
          <div className="map-container">
            <h2 className="map-title">🗺️ Norske Oljeområder</h2>
            {/* Removed inline style height: "400px" to use CSS class .map-div */}
            <div ref={mapRef} className="map-div" />
            <div className="map-hint">Klikk på et oljefelt for å fase det ut! 🛢️ → 🌱</div>
          </div>
        );
    }
  };

  return (
    <div
      className="container"
      style={{
        filter: `saturate(${gameState.saturationLevel}%) brightness(${gameState.saturationLevel > 60 ? 100 : 80}%)`,
        transition: "filter 1s ease-in-out",
      }}
    >
      {/* Tutorial overlay */}
      {gameState.tutorialStep < 5 && (
        <TutorialOverlay
          step={gameState.tutorialStep}
          onNext={() => dispatch({ type: "ADVANCE_TUTORIAL" })}
          onSkip={() => dispatch({ type: "SKIP_TUTORIAL" })}
        />
      )}

      {/* Game feedback */}
      <GameFeedback gameState={gameState} />

      {/* Header */}
      <div className="header">
        <div className="header-top">
          <h1 className="title">🌍 PHASE OUT VILLAGE</h1>
          <div className="year-badge">TIL 2040!</div>
        </div>

        {/* Progress Bar - Moved here to be inside the header, as in the screenshot */}
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${((gameFields.length - gameFields.filter((f) => f.status === "active").length) / gameFields.length) * 100}%`,
            }}
          />
        </div>

        {/* Game Stats */}
        <div className="stats-grid">
          <div className="stat-card stat-card-green">
            <div className="stat-emoji">🌱</div>
            <div className="stat-value" style={{ color: "#166534" }}>
              {score}
            </div>
            <div className="stat-label" style={{ color: "#16A34A" }}>
              Klimapoeng
            </div>
          </div>
          <div className="stat-card stat-card-yellow">
            <div className="stat-emoji">💰</div>
            <div className="stat-value" style={{ color: "#92400E" }}>
              {budget} mrd
            </div>
            <div className="stat-label" style={{ color: "#D97706" }}>
              Budsjett
            </div>
          </div>
          <div className="stat-card stat-card-blue">
            <div className="stat-emoji">📅</div>
            <div className="stat-value" style={{ color: "#1E40AF" }}>
              {year}
            </div>
            <div className="stat-label" style={{ color: "#2563EB" }}>
              År
            </div>
          </div>
        </div>
      </div>

      {/* View Toggle - Now outside the main header, but still centered */}
      <div className="view-toggle">
        <button className={`view-button ${currentView === "map" ? "view-button-active" : ""}`} onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "map" })}>
          🗺️ Kart
        </button>
        <button className={`view-button ${currentView === "emissions" ? "view-button-active" : ""}`} onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "emissions" })}>
          📊 Utslipp
        </button>
      </div>

      {/* Dynamic View Container and Stats Dashboard are grouped here */}
      <div className="main-content-area">
        {renderCurrentView()}

        {/* Stats Dashboard */}
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3 className="dashboard-title">📊 Utslipp</h3>
            <div className="dashboard-value">{totalEmissions.toFixed(1)} Mt</div>
            <div className="dashboard-label">CO₂ per år</div>
          </div>
          <div className="dashboard-card">
            <h3 className="dashboard-title">⚡ Produksjon</h3>
            <div className="dashboard-value-orange">{totalProduction.toFixed(1)} mill. boe</div>
            <div className="dashboard-label">per år</div>
          </div>
        </div>

        {/* Achievements */}
        {achievements.length > 0 && (
          <div className="achievement-card">
            <h3 className="achievement-title">🏆 Prestasjoner</h3>
            <div className="achievement-list">
              {achievements.map((achievement, index) => (
                <span key={index} className="achievement-badge">
                  {achievement}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Climate Dashboard - New component showing climate metrics */}
        <ClimateDashboard gameState={gameState} />

        {/* Investment Panel - New component for making investments */}
        <InvestmentPanel gameState={gameState} dispatch={dispatch} />
      </div>

      {/* Progressive data panel */}
      <ProgressiveDataPanel gameState={gameState} layer={gameState.dataLayerUnlocked} />

      {/* Enhanced achievements with tooltips */}
      {achievements.length > 0 && (
        <div className="achievement-card">
          <h3 className="achievement-title">🏆 Dine Prestasjoner</h3>
          <div className="achievement-list">
            {achievements.map((achievement, index) => {
              const badge = Object.values(ACHIEVEMENT_BADGES).find((b) => b.title === achievement);
              return (
                <div key={index} className="achievement-badge enhanced" title={badge?.desc}>
                  {badge?.emoji} {badge?.title || achievement}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Field Modal */}
      {showFieldModal && <FieldModal selectedField={selectedField} budget={budget} onPhaseOut={phaseOutField} onClose={() => dispatch({ type: "TOGGLE_FIELD_MODAL", payload: false })} />}
    </div>
  );
};

export default PhaseOutMapPage;
