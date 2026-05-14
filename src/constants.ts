export const i18n: Record<string, any> = {
  en: {
    appTitle: "Idea Nest",
    btnMountIfc: "Launch Base Audit",
    btnStartScan: "► Start Audit Scan",
    btnExport: "📊 Export Excel (.xlsx)",
    lblPriceRule: "Price Rule:",
    lblBimModel: "BIM Model:",
    lblState: "State:",
    logAwaiting: "System Live. Awaiting IFC Model for initial target acquisition.",
    colTech: "⚙️ Technical Audit Stream",
    colFin: "💵 Financial Settlement Stream",
    statNet: "Total Net (NET)",
    statTotal: "TOTAL ELEMENTS",
    modalTitle: "AI Data Mapping",
    modalBtnContract: "🧾 Contract Price Upload",
    modalBtnAI: "🧠 AI Market Rate (Gemini 3)",
    modalAiDesc: "▶ Gemini 3 Flash OS Active... Extracting Real-time 2026 KL Market Data for [AI Suggestion].",
    modalManualDesc: "Waiting for Contract Excel/CSV upload...",
    thDesc: "BIM Extraction (Model)",
    thNet: "Est. Net Qty",
    thSource: "Pricing Source",
    thRate: "Est. Rate (RM)",
    btnLockPrices: "Lock Pricing & Arm Scanner",
    pdfReportTitle: "Commercial BQ Settlement Book",
    pdfReportSub: "Structured Storey Output",
    pdfProjId: "Project ID:",
    pdfPricing: "Pricing Strategy:",
    pdfDate: "Audit Date:",
    pdfThId: "IFC ID",
    pdfThClass: "Class",
    pdfThDim: "Dimensions",
    pdfThUnit: "Unit",
    pdfThNet: "Net Qty",
    pdfThStatus: "VO Status",
    pdfLoc: "📍 LOCATION:",
    pdfMat: "▶ MATERIAL:",
    pdfTotalFor: "Total for",
    signLine: "Certified Auditor Signature:",
    aiSuggest: "✨ AI Suggestion",
    aiContract: "🧾 Contract",
    lblProjName: "Project Name:",
    lblClientName: "Client Name:",
    btnUploadLogo: "Upload Logo",
    phProjName: "e.g. KLCC Tower 2",
    phClientName: "e.g. Petronas",
    pdfGuid: "System Blueprint ID:",
    pdfTime: "Secure Gen Timestamp:",
    pdfClient: "Bill To Client:",
    pdfStatus: "Status:",
    btnFocus: "Focus",
    btnIsolate: "Isolate",
    btnClearSelection: "Clear Selection",
  }
};

export const BimTranslation: Record<string, any> = {
  "IfcWall": { en: "Wall" },
  "IfcWallStandardCase": { en: "Wall Standard Case" },
  "IfcSlab": { en: "Slab" },
  "IfcBeam": { en: "Beam" },
  "IfcColumn": { en: "Column" },
  "IfcFooting": { en: "Footing" },
  "IfcDoor": { en: "Door" },
  "IfcWindow": { en: "Window" },
  "IfcStair": { en: "Stair" },
  "IfcCurtainWall": { en: "Curtain Wall" },
  "IfcPipeSegment": { en: "Pipe" },
  "IfcDuctSegment": { en: "Duct" },
  "IfcCableCarrierSegment": { en: "Cable Tray" },
  "IfcSanitaryTerminal": { en: "Sanitary Terminal" },
  "IfcEquipmentElement": { en: "Equipment" },
  "IfcCovering": { en: "Covering" },
};

export const StoreyMap = [
  { id: "L1", name: "Storey L1 (Ground)", h: 0 },
  { id: "L2", name: "Storey L2 (Mezzanine)", h: 5 }
];

export const BimMaterialMap: Record<string, string[]> = {
  "IfcWall": ["Brick 200mm", "Partition Board", "Lightweight Block"],
  "IfcWallStandardCase": ["Concrete C30 Grade", "Concrete C40 Spec"],
  "IfcSlab": ["Concrete C40 Spec", "Precast RC Slab"],
  "IfcBeam": ["Steel Q345", "Concrete C30 Grade"],
  "IfcColumn": ["Steel Q345", "Concrete C40 Spec"],
  "IfcFooting": ["Concrete C30 Grade", "Concrete C40 Spec"],
  "IfcDoor": ["Solid Timber Oak Door", "Fire Rated Metal Door (1H)"],
  "IfcWindow": ["Aluminum Casement Window", "Fixed Glass Window"],
  "IfcStair": ["Concrete C30 Grade", "Steel Q345"],
  "IfcCurtainWall": ["Glass Panel", "Aluminum Frame"],
  "IfcPipeSegment": ["PVC Pipe", "Galvanized Iron Pipe"],
  "IfcDuctSegment": ["Galvanized Steel Duct", "Flexible Duct"],
  "IfcCableCarrierSegment": ["Galvanized Steel Tray", "PVC Trunking"],
  "IfcSanitaryTerminal": ["Ceramic Toilet", "Ceramic Basin"],
  "IfcEquipmentElement": ["Water Pump", "Chiller Unit"],
  "IfcCovering": ["Gypsum Board Ceiling", "Marble Tile", "Vinyl Flooring", "Wall Paint"]
};

export function translateBim(term: string) {
  if (!term) return 'Unknown';
  return BimTranslation[term]?.en || term;
}

export function formatNum(v: number) { return (v || 0).toFixed(3); }
export function formatMoney(v: number) { return (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export function simpleHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return hash;
}
