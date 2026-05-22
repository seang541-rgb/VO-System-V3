import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import {
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCCOLUMN,
  IFCBEAM,
  IFCDOOR,
  IFCWINDOW,
  IFCWALL,
  IFCFOOTING,
  IFCSTAIR,
  IFCCURTAINWALL,
  IFCPIPESEGMENT,
  IFCDUCTSEGMENT,
  IFCSANITARYTERMINAL,
  IFCCOVERING,
  IFCFLOWSEGMENT,
  IFCFLOWTERMINAL,
  IFCFLOWCONTROLLER,
  IFCFLOWFITTING,
  IFCFLOWMOVINGDEVICE,
  IFCFLOWSTORAGEDEVICE,
  IFCFLOWTREATMENTDEVICE,
  IFCDISTRIBUTIONELEMENT,
  IFCMEMBER,
  IFCRAILING,
  IFCPLATE,
  IFCDISCRETEACCESSORY,
  IFCMECHANICALFASTENER,
  IFCFASTENER,
  IFCENERGYCONVERSIONDEVICE,
  IFCROOF,
  IFCRAMP,
  IFCBUILDINGELEMENTPROXY,
  IFCFURNISHINGELEMENT,
  IFCELEMENTASSEMBLY,
  IFCCABLECARRIERSEGMENT,
  IFCEQUIPMENTELEMENT,
  IFCOPENINGELEMENT,
  IFCBUILDINGSTOREY,
} from 'web-ifc';
import {
  BimAttributeValue,
  BimComponent,
  BimQuantityValue,
  VoComparisonResults,
  buildComponentFingerprint,
  compareModels,
} from './vo-diff-core';
import { buildQsLabel, buildSpatialLocation, inferSmm2Section } from './qs-helpers';
import { STEP_SUPPORTED_TYPE_NAMES, buildFallbackProps, buildStepMaterialMap, buildStepPropertyDataMap, parseStepEntities, parseStepString } from './ifc-step-fallback';

export { buildCommercialBreakdown } from './vo-diff-core';
export type { BimFieldChange, BimComponent, ModifiedBimComponent, VoComparisonResults, VoCommercialAction, VoCommercialBreakdown, BqLineItem, BqMappingContext } from './vo-diff-core';

export interface ElementProperties {
  expressId: number;
  ifcType: string;
  name: string;
  globalId: string;
  storey: string;
  properties: Record<string, string>;
  quantities: Record<string, string>;
}

export interface StoreyInfo {
  id: number;
  name: string;
  elevation: number;
}

export interface ElementTypeInfo {
  typeCode: number;
  name: string;
  count: number;
}

const SUPPORTED_ELEMENT_TYPES = [
  IFCWALL,
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCCOLUMN,
  IFCBEAM,
  IFCDOOR,
  IFCWINDOW,
  IFCFOOTING,
  IFCSTAIR,
  IFCCURTAINWALL,
  IFCPIPESEGMENT,
  IFCDUCTSEGMENT,
  IFCSANITARYTERMINAL,
  IFCCOVERING,
  IFCFLOWSEGMENT,
  IFCFLOWTERMINAL,
  IFCFLOWCONTROLLER,
  IFCFLOWFITTING,
  IFCFLOWMOVINGDEVICE,
  IFCFLOWSTORAGEDEVICE,
  IFCFLOWTREATMENTDEVICE,
  IFCDISTRIBUTIONELEMENT,
  IFCMEMBER,
  IFCRAILING,
  IFCPLATE,
  IFCDISCRETEACCESSORY,
  IFCMECHANICALFASTENER,
  IFCFASTENER,
  IFCENERGYCONVERSIONDEVICE,
  IFCROOF,
  IFCRAMP,
  IFCBUILDINGELEMENTPROXY,
  IFCFURNISHINGELEMENT,
  IFCELEMENTASSEMBLY,
  IFCCABLECARRIERSEGMENT,
  IFCEQUIPMENTELEMENT,
  IFCOPENINGELEMENT,
];

function unwrapIfcValue(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => unwrapIfcValue(item));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) return unwrapIfcValue(record.value);
  }
  return value;
}

function normalizeIfcText(value: unknown): string {
  const normalized = unwrapIfcValue(value);
  if (normalized == null) return '';
  if (Array.isArray(normalized)) return normalized.map((entry) => normalizeIfcText(entry)).filter(Boolean).join(', ');
  if (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean') return String(normalized).trim();
  if (typeof normalized === 'object') {
    const record = normalized as Record<string, unknown>;
    if ('Name' in record) return normalizeIfcText(record.Name);
    if ('type' in record) return normalizeIfcText(record.type);
  }
  return '';
}

function readIfcRef(value: unknown): number | null {
  const normalized = unwrapIfcValue(value);
  return typeof normalized === 'number' && Number.isFinite(normalized) ? normalized : null;
}

function readIfcRefList(value: unknown): number[] {
  const normalized = unwrapIfcValue(value);
  if (!Array.isArray(normalized)) return [];
  return normalized.map((entry) => readIfcRef(entry)).filter((entry): entry is number => entry !== null);
}

function summarizeRelatedLine(typeName: string, line: any): string {
  const globalId = normalizeIfcText(line?.GlobalId);
  const name = normalizeIfcText(line?.Name);
  const predefinedType = normalizeIfcText(line?.PredefinedType);
  return [
    typeName || 'IfcReference',
    line?.expressID ? `#${line.expressID}` : '',
    globalId ? `[${globalId}]` : '',
    name ? `"${name}"` : '',
    predefinedType ? `<${predefinedType}>` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function roundMetric(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : '0.0000';
}

function applyFlatMatrix(x: number, y: number, z: number, matrix: ArrayLike<number>) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  };
}

function triangleArea(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  return 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
}

function signedTriangleVolume(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  return (
    a.x * (b.y * c.z - b.z * c.y) -
    a.y * (b.x * c.z - b.z * c.x) +
    a.z * (b.x * c.y - b.y * c.x)
  ) / 6;
}

function makeAttribute(key: string, value: string, source: BimAttributeValue['source']): BimAttributeValue {
  return { key, label: key, value, source };
}

function makeQuantity(key: string, value: number, unit: string, source: BimQuantityValue['source']): BimQuantityValue {
  return { key, label: key, value, unit, source };
}

function humanizeIfcName(name: string) {
  return name.replace(/^Ifc/, '') || name;
}

function resolveIfcEntityLine(api: any, modelID: number, expressID: number, props: any) {
  if (props && normalizeIfcText(props?.GlobalId)) return props;

  try {
    return api.GetLine(modelID, expressID);
  } catch {
    return props ?? null;
  }
}

function getSafeIfcTypeName(api: any, typeCode: unknown, fallback = 'IfcEntity') {
  if (typeof typeCode !== 'number' || !Number.isFinite(typeCode)) return fallback;
  try {
    const resolved = api?.GetNameFromTypeCode?.(typeCode);
    return typeof resolved === 'string' && resolved.trim() ? resolved : `${fallback}#${typeCode}`;
  } catch {
    return `${fallback}#${typeCode}`;
  }
}

export class BimEngine {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  globalClipPlane: THREE.Plane;
  clippingEnabled = false;
  matAdded: THREE.MeshLambertMaterial;
  matDeleted: THREE.MeshLambertMaterial;
  matModified: THREE.MeshLambertMaterial;
  matFocused: THREE.MeshLambertMaterial;
  components: BimComponent[] = [];
  animFrameId: number | null = null;
  ifcLoader: IFCLoader;
  ifcModel: any = null;
  onLog?: (text: string) => void;

  // Feature state: diff visualization
  private originalMaterials = new Map<number, THREE.Material | THREE.Material[]>();
  private diffActive = false;

  // Feature state: storey filtering
  private storeyMap = new Map<number, number[]>(); // storeyExpressID -> element expressIDs
  private storeyList: StoreyInfo[] = [];

  // Feature state: element type filtering
  private expressIdToType = new Map<number, number>(); // expressID -> IFC type code

  // Feature state: picking
  private pickHandler: ((event: MouseEvent) => void) | null = null;
  private pickCallback: ((props: ElementProperties | null) => void) | null = null;

  // Feature state: isolation
  private isolationActive = false;
  private isolationOriginalMaterials = new Map<number, THREE.Material | THREE.Material[]>();

  // Feature state: measurement
  private measureHandler: ((event: MouseEvent) => void) | null = null;
  private measureCallback: ((distance: number, points: [THREE.Vector3, THREE.Vector3]) => void) | null = null;
  private measureFirstPoint: THREE.Vector3 | null = null;
  private measureObjects: THREE.Object3D[] = [];

  /**
   * Public handle for the raw web-ifc API + the currently-loaded model ID.
   * Used by the audit engine (`src/audit/extractor.ts`) so it can run pset
   * walks without going through this class. Returns null when nothing is
   * loaded.
   */
  getIfcHandle(): { api: any; modelID: number } | null {
    if (!this.ifcModel) return null;
    const api = (this.ifcLoader as any)?.ifcManager?.ifcAPI;
    const modelID = (this.ifcModel as any)?.modelID;
    if (!api || typeof modelID !== 'number') return null;
    return { api, modelID };
  }

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f7fb);
    this.camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 5000);
    this.camera.position.set(32, 24, 32);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 10000;
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd8dee8, 1.1);
    hemiLight.position.set(0, 200, 0);
    this.scene.add(hemiLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(120, 180, 90);
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.55);
    fillLight.position.set(-90, 110, -70);
    this.scene.add(fillLight);
    this.globalClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 50);
    this.matAdded = new THREE.MeshLambertMaterial({ color: 0x16a34a, opacity: 0.82, transparent: true, side: THREE.DoubleSide });
    this.matDeleted = new THREE.MeshLambertMaterial({ color: 0xdc2626, opacity: 0.82, transparent: true, side: THREE.DoubleSide });
    this.matModified = new THREE.MeshLambertMaterial({ color: 0xea580c, opacity: 0.84, transparent: true, side: THREE.DoubleSide });
    this.matFocused = new THREE.MeshLambertMaterial({ color: 0x38bdf8, opacity: 0.95, transparent: true, side: THREE.DoubleSide, depthTest: false });
    this.ifcLoader = new IFCLoader();
    this.ifcLoader.ifcManager.setWasmPath('/');
    window.addEventListener('resize', this.onWindowResize);
    this.animate();
  }
  dispose() {
    window.removeEventListener('resize', this.onWindowResize);
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.disablePicking();
    this.disableMeasurement();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  private needsInitialResize = true;

  onWindowResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.needsInitialResize = false;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    // Auto-resize when container becomes visible after starting hidden
    if (this.needsInitialResize && this.container.clientWidth > 0) {
      this.onWindowResize();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private prepareModelForPresentation(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    object.updateMatrixWorld(true);
    this.applyViewerMaterials(object);
  }

  private applyViewerMaterials(object: THREE.Object3D) {
    const neutralColor = new THREE.Color(0xd7dee6);
    const glassColor = new THREE.Color(0x8ecae6);
    const edgeColor = new THREE.Color(0x6b7c8d);

    object.traverse((child: any) => {
      if (!child?.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const typeHint = `${child.name || ''} ${materials.map((material: any) => material?.name || '').join(' ')}`.toLowerCase();      const isGlazing = /glass|window|glazing|curtain/.test(typeHint);

      if (child.geometry?.attributes?.normal == null && typeof child.geometry?.computeVertexNormals === 'function') {
        child.geometry.computeVertexNormals();
      }

      materials.forEach((material: any) => {
        if (!material) return;
        if (material.color?.isColor) {
          material.color.lerp(isGlazing ? glassColor : neutralColor, isGlazing ? 0.55 : 0.72);
        }
        if ('emissive' in material && material.emissive?.isColor) {
          material.emissive.set(isGlazing ? 0x1d4f63 : 0x9aa7b2);
          material.emissiveIntensity = isGlazing ? 0.08 : 0.03;
        }
        if ('roughness' in material) material.roughness = 0.92;
        if ('metalness' in material) material.metalness = 0;
        material.side = THREE.DoubleSide;
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1;
        material.polygonOffsetUnits = 1;
        material.transparent = isGlazing;
        material.opacity = isGlazing ? 0.42 : 1;
        material.needsUpdate = true;
      });

      if (!child.userData.viewerEdges && child.geometry) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(child.geometry, 28),
          new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: isGlazing ? 0.18 : 0.24 }),
        );
        edges.name = 'viewer-edges';
        child.add(edges);
        child.userData.viewerEdges = true;
      }
    });
  }

  private fitCameraToObject(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return false;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 1);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const distance = (radius / Math.tan(halfFov)) * 1.2;
    const direction = new THREE.Vector3(1, 0.7, 1).normalize();

    this.camera.near = Math.max(distance / 250, 0.1);
    this.camera.far = Math.max(distance * 30, radius * 50);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(center.clone().addScaledVector(direction, distance));
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(radius * 0.2, 0.5);
    this.controls.maxDistance = Math.max(distance * 8, radius * 20);
    this.controls.update();
    return true;
  }
  resetCamera = () => {
    if (!this.ifcModel) return;
    this.fitCameraToObject(this.ifcModel);
  };

  toggleClipping = () => {
    this.clippingEnabled = !this.clippingEnabled;
    const planes = this.clippingEnabled ? [this.globalClipPlane] : [];
    [this.matAdded, this.matDeleted, this.matModified, this.matFocused].forEach((mat) => {
      mat.clippingPlanes = planes;
    });

    if (!this.ifcModel) return;
    this.ifcModel.traverse((child: any) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material: any) => {
            material.clippingPlanes = planes;
          });
        } else {
          child.material.clippingPlanes = planes;
        }
      }
    });

    if (this.clippingEnabled) {
      const box = new THREE.Box3().setFromObject(this.ifcModel);
      this.globalClipPlane.constant = (box.max.y + box.min.y) / 2;
    }
  };

  async loadIfcModel(buffer: ArrayBuffer, onProgress?: (p: number, text?: string) => void): Promise<BimComponent[]> {
    if (this.ifcModel) {
      this.scene.remove(this.ifcModel);
      this.ifcModel = null;
    }
    this.components = [];

    try {
      onProgress?.(5, 'Loading IFC geometry...');
      this.ifcModel = await this.ifcLoader.parse(buffer);
      this.prepareModelForPresentation(this.ifcModel);
      this.scene.add(this.ifcModel);
      this.resetCamera();
      onProgress?.(20, 'Extracting BIM elements...');
      await this.extractComponents(onProgress);
      if (this.components.length === 0) {
        onProgress?.(82, 'Native extraction returned 0 items. Falling back to STEP text parsing...');
        await this.extractComponentsFromStepText(buffer, onProgress);
      }
      return this.components;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'unknown error';
      onProgress?.(18, `3D parse failed (${errMsg}). Falling back to STEP text parsing...`);
      await this.extractComponentsFromStepText(buffer, onProgress);
      if (this.components.length > 0) {
        this.ifcModel = null;
        return this.components;
      }
      throw new Error(`Failed to load IFC: ${errMsg}`);
    }
  }

  private async extractComponents(onProgress?: (p: number, text?: string) => void) {
    if (!this.ifcModel) return;
    const manager = this.ifcLoader.ifcManager;
    const modelID = this.ifcModel.modelID;
    const idsByType: number[][] = [];
    let totalItems = 0;

    for (const typeId of SUPPORTED_ELEMENT_TYPES) {
      try {
        const expressIds = (await manager.getAllItemsOfType(modelID, typeId, false)) as number[];
        if (expressIds.length > 0) {
          idsByType.push(expressIds);
          totalItems += expressIds.length;
        }
      } catch {
        // Ignore schema-specific failures.
      }
    }

    if (totalItems === 0) {
      this.components = [];
      onProgress?.(100, 'Extraction complete. No supported IFC elements were found.');
      return;
    }

    const uniqueMap = new Map<string, BimComponent>();
    let processed = 0;
    let missingGlobalIdCount = 0;
    let buildErrorCount = 0;
    const sampleErrors: string[] = [];

    for (const expressIds of idsByType) {
      for (const expressID of expressIds) {
        if (processed % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        try {
          const props = await manager.getItemProperties(modelID, expressID, false);
          const component = await this.buildComponentSnapshot(manager, modelID, expressID, props);
          if (component) {
            uniqueMap.set(component.ifcId, component);
          } else {
            missingGlobalIdCount += 1;
          }
        } catch (error: unknown) {
          buildErrorCount += 1;
          if (sampleErrors.length < 3) {
            sampleErrors.push(`#${expressID}: ${error instanceof Error ? error.message : 'Unknown extraction error'}`);
          }
        }

        processed += 1;
        const progress = 20 + Math.round((processed / totalItems) * 75);
        const note = buildErrorCount > 0
          ? ` | errors ${buildErrorCount}`
          : missingGlobalIdCount > 0
            ? ` | skipped ${missingGlobalIdCount}`
            : '';
        onProgress?.(progress, `Extracting elements ${processed}/${totalItems}${note}...`);
      }
    }

    this.components = Array.from(uniqueMap.values()).sort((left, right) => left.ifcId.localeCompare(right.ifcId));
    const detailParts = [
      `Extraction complete. Indexed ${this.components.length} unique elements from ${totalItems} candidates.`,
      missingGlobalIdCount > 0 ? `Missing GlobalId fallbacks failed: ${missingGlobalIdCount}.` : '',
      buildErrorCount > 0 ? `Build errors: ${buildErrorCount}.` : '',
      sampleErrors.length > 0 ? `Samples: ${sampleErrors.join(' | ')}` : '',
    ].filter(Boolean);
    onProgress?.(100, detailParts.join(' '));
  }

  private async extractComponentsFromStepText(buffer: ArrayBuffer, onProgress?: (p: number, text?: string) => void) {
    const stepText = new TextDecoder('utf-8').decode(buffer);
    const entities = parseStepEntities(stepText);
    const materialMap = buildStepMaterialMap(entities);
    const propertyDataMap = buildStepPropertyDataMap(entities);
    const supported = [...entities.values()].filter((entity) => STEP_SUPPORTED_TYPE_NAMES.has(entity.type));
    const uniqueMap = new Map<string, BimComponent>();
    let processed = 0;

    for (const entity of supported) {
      const component = this.buildComponentFromStepEntity(
        entity.expressID,
        buildFallbackProps(entity, materialMap.get(entity.expressID) || ''),
        propertyDataMap.get(entity.expressID),
      );
      if (component) uniqueMap.set(component.ifcId, component);
      processed += 1;
      if (supported.length > 0) {
        const progress = 82 + Math.round((processed / supported.length) * 18);
        onProgress?.(progress, `STEP fallback parsing ${processed}/${supported.length}...`);
      }
    }

    this.components = Array.from(uniqueMap.values()).sort((left, right) => left.ifcId.localeCompare(right.ifcId));
    onProgress?.(100, `STEP fallback complete. Indexed ${this.components.length} unique elements from ${supported.length} STEP candidates.`);
  }

  private buildComponentFromStepEntity(expressID: number, props: any, propertyData?: { attributes: Record<string, BimAttributeValue>; quantities: Record<string, BimQuantityValue>; psetSignature: string }): BimComponent | null {
    const globalId = normalizeIfcText(props?.GlobalId);
    if (!globalId) return null;

    const type = normalizeIfcText(props?.__typeName) || 'IfcElement';
    const objectType = normalizeIfcText(props?.ObjectType);
    const predefinedType = normalizeIfcText(props?.PredefinedType);
    const materialSignature = normalizeIfcText(props?.__fallbackMaterialSignature);
    const attributes = propertyData?.attributes ?? {};
    const quantities = propertyData?.quantities ?? {};
    const locationData = buildSpatialLocation([], type);
    const section = inferSmm2Section(type, materialSignature, attributes);
    const qsLabel = buildQsLabel(
      type,
      materialSignature,
      predefinedType,
      objectType,
      attributes,
      quantities,
      { sizeX: 0, sizeY: 0, sizeZ: 0 },
      locationData,
    ) || humanizeIfcName(type);

    const componentWithoutFingerprint: Omit<BimComponent, 'fingerprint'> = {
      ifcId: globalId,
      expressID,
      type,
      name: normalizeIfcText(props?.Name),
      objectType,
      predefinedType,
      description: normalizeIfcText(props?.Description),
      tag: normalizeIfcText(props?.Tag),
      placementId: readIfcRef(props?.ObjectPlacement),
      representationId: readIfcRef(props?.Representation),
      typeSignature: '',
      materialSignature,
      psetSignature: propertyData?.psetSignature ?? '',
      geometrySignature: '',
      locationPath: locationData.locationPath,
      siteName: locationData.siteName,
      buildingName: locationData.buildingName,
      levelName: locationData.levelName,
      blockName: locationData.blockName || '',
      zoneName: locationData.zoneName || '',
      roomName: locationData.roomName || '',
      axisName: locationData.axisName || '',
      gridRoomName: locationData.gridRoomName,
      preferredLocationLabel: locationData.preferredLocationLabel,
      preferredLocationKind: locationData.preferredLocationKind || 'unassigned',
      isOpening: type === 'IfcOpeningElement',
      openingHostIfcId: '',
      openingHostType: '',
      openingHostName: '',
      openingCount: 0,
      openingSignature: '',
      smm2SectionCode: section.code,
      smm2SectionTitle: section.title,
      smm2SectionSort: section.sort,
      trade: section.label,
      qsLabel,
      attributes,
      quantities,
    };

    return {
      ...componentWithoutFingerprint,
      fingerprint: buildComponentFingerprint(componentWithoutFingerprint),
    };
  }

  private async buildComponentSnapshot(manager: any, modelID: number, expressID: number, props: any): Promise<BimComponent | null> {
    const api = manager.ifcAPI;
    const entityLine = resolveIfcEntityLine(api, modelID, expressID, props);
    const globalId = normalizeIfcText(entityLine?.GlobalId);
    if (!globalId) return null;

    const fallbackType = normalizeIfcText((entityLine as any)?.__typeName);
    const type = fallbackType || (entityLine?.type ? getSafeIfcTypeName(api, entityLine.type, 'IfcElement') : '') || normalizeIfcText(await manager.getIfcType(modelID, expressID)) || 'IfcElement';
    const objectType = normalizeIfcText(entityLine?.ObjectType);
    const predefinedType = normalizeIfcText(entityLine?.PredefinedType);
    const relationships = this.collectRelationshipData(api, modelID, expressID);
    const fallbackMaterialSignature = normalizeIfcText((entityLine as any)?.__fallbackMaterialSignature);
    const materialSignature = relationships.materialSignature || fallbackMaterialSignature;
    const propertyData = this.collectPropertyData(api, modelID, expressID, relationships.typeObjectIds);
    const geometryData = this.collectGeometryData(api, modelID, expressID);
    const locationData = this.collectSpatialLocation(api, modelID, expressID, type);
    const section = inferSmm2Section(type, materialSignature, propertyData.attributes);
    const qsLabel = buildQsLabel(
      type,
      materialSignature,
      predefinedType,
      objectType,
      propertyData.attributes,
      propertyData.quantities,
      geometryData,
      locationData,
    ) || humanizeIfcName(type);

    const componentWithoutFingerprint: Omit<BimComponent, 'fingerprint'> = {
      ifcId: globalId,
      expressID,
      type,
      name: normalizeIfcText(entityLine?.Name),
      objectType,
      predefinedType,
      description: normalizeIfcText(entityLine?.Description),
      tag: normalizeIfcText(entityLine?.Tag),
      placementId: readIfcRef(entityLine?.ObjectPlacement),
      representationId: readIfcRef(entityLine?.Representation),
      typeSignature: relationships.typeSignature,
      materialSignature,
      psetSignature: propertyData.psetSignature,
      geometrySignature: geometryData.signature,
      locationPath: locationData.locationPath,
      siteName: locationData.siteName,
      buildingName: locationData.buildingName,
      levelName: locationData.levelName,
      blockName: locationData.blockName || '',
      zoneName: locationData.zoneName || '',
      roomName: locationData.roomName || '',
      axisName: locationData.axisName || '',
      gridRoomName: locationData.gridRoomName,
      preferredLocationLabel: locationData.preferredLocationLabel,
      preferredLocationKind: locationData.preferredLocationKind || 'unassigned',
      isOpening: type === 'IfcOpeningElement',
      openingHostIfcId: relationships.openingHostIfcId,
      openingHostType: relationships.openingHostType,
      openingHostName: relationships.openingHostName,
      openingCount: relationships.openingCount,
      openingSignature: relationships.openingSignature,
      smm2SectionCode: section.code,
      smm2SectionTitle: section.title,
      smm2SectionSort: section.sort,
      trade: section.label,
      qsLabel,
      attributes: propertyData.attributes,
      quantities: {
        ...propertyData.quantities,
        ...(geometryData.geometryVolume > 0
          ? {
              'Derived.GeometryVolume': makeQuantity('Derived.GeometryVolume', geometryData.geometryVolume, 'm3', 'geometry'),
            }
          : {}),
        ...(geometryData.geometrySurfaceArea > 0
          ? {
              'Derived.GeometrySurfaceArea': makeQuantity('Derived.GeometrySurfaceArea', geometryData.geometrySurfaceArea, 'm2', 'geometry'),
            }
          : {}),
        ...(geometryData.bboxVolume > 0
          ? {
              'Derived.BBoxVolumeEstimate': makeQuantity('Derived.BBoxVolumeEstimate', geometryData.bboxVolume, 'm3', 'bbox'),
            }
          : {}),
        ...(geometryData.bboxSurfaceArea > 0
          ? {
              'Derived.BBoxSurfaceAreaEstimate': makeQuantity('Derived.BBoxSurfaceAreaEstimate', geometryData.bboxSurfaceArea, 'm2', 'bbox'),
            }
          : {}),
      },
    };

    return {
      ...componentWithoutFingerprint,
      fingerprint: buildComponentFingerprint(componentWithoutFingerprint),
    };
  }

  private collectRelationshipData(api: any, modelID: number, expressID: number) {
    const inverseLine = api.GetLine(modelID, expressID, false, true);
    const typeObjectIds = readIfcRefList(inverseLine?.IsTypedBy)
      .map((relationId) => api.GetLine(modelID, relationId))
      .map((relation: any) => readIfcRef(relation?.RelatingType))
      .filter((id: number | null): id is number => id !== null);

    const typeSignature = typeObjectIds
      .map((typeId) => api.GetLine(modelID, typeId))
      .map((line: any) => summarizeRelatedLine(getSafeIfcTypeName(api, line?.type), line))
      .sort()
      .join(' | ');

    const materialSignature = readIfcRefList(inverseLine?.HasAssociations)
      .map((relationId) => api.GetLine(modelID, relationId))
      .filter((relation: any) => getSafeIfcTypeName(api, relation?.type) === 'IfcRelAssociatesMaterial')
      .map((relation: any) => readIfcRef(relation?.RelatingMaterial))
      .filter((id: number | null): id is number => id !== null)
      .map((materialId) => api.GetLine(modelID, materialId))
      .map((line: any) => summarizeRelatedLine(getSafeIfcTypeName(api, line?.type), line))
      .sort()
      .join(' | ');

    const openingIds = readIfcRefList(inverseLine?.HasOpenings)
      .map((relationId) => api.GetLine(modelID, relationId))
      .map((relation: any) => readIfcRef(relation?.RelatedOpeningElement))
      .filter((id: number | null): id is number => id !== null);

    const openingSignature = openingIds
      .map((openingId) => api.GetLine(modelID, openingId))
      .map((line: any) => summarizeRelatedLine(getSafeIfcTypeName(api, line?.type), line))
      .sort()
      .join(' | ');

    const openingHostIds = readIfcRefList(inverseLine?.VoidsElements)
      .map((relationId) => api.GetLine(modelID, relationId))
      .map((relation: any) => readIfcRef(relation?.RelatingBuildingElement))
      .filter((id: number | null): id is number => id !== null);

    const openingHostLine = openingHostIds.length > 0 ? api.GetLine(modelID, openingHostIds[0]) : null;

    return {
      typeObjectIds,
      typeSignature,
      materialSignature,
      openingCount: openingIds.length,
      openingSignature,
      openingHostIfcId: normalizeIfcText(openingHostLine?.GlobalId),
      openingHostType: openingHostLine ? getSafeIfcTypeName(api, openingHostLine?.type, 'IfcElement') : '',
      openingHostName: normalizeIfcText(openingHostLine?.Name),
    };
  }

  private collectPropertyData(api: any, modelID: number, expressID: number, typeObjectIds: number[]) {
    const inverseLine = api.GetLine(modelID, expressID, false, true);
    const attributes: Record<string, BimAttributeValue> = {};
    const quantities: Record<string, BimQuantityValue> = {};
    const definitionIds = new Set<number>();

    readIfcRefList(inverseLine?.IsDefinedBy)
      .map((relationId) => api.GetLine(modelID, relationId))
      .filter((relation: any) => getSafeIfcTypeName(api, relation?.type) === 'IfcRelDefinesByProperties')
      .forEach((relation: any) => {
        const definitionId = readIfcRef(relation?.RelatingPropertyDefinition);
        if (definitionId !== null) definitionIds.add(definitionId);
      });

    typeObjectIds
      .map((typeId) => api.GetLine(modelID, typeId))
      .forEach((typeLine: any) => {
        readIfcRefList(typeLine?.HasPropertySets).forEach((definitionId) => definitionIds.add(definitionId));
      });

    const psetSignatureParts: string[] = [];

    [...definitionIds].forEach((definitionId) => {
      const definition = api.GetLine(modelID, definitionId);
      const definitionType = getSafeIfcTypeName(api, definition?.type, 'IfcPropertyDefinition');
      const definitionName = normalizeIfcText(definition?.Name) || `${definitionType}#${definitionId}`;
      psetSignatureParts.push(`${definitionType}:${definitionName}`);

      if (definitionType === 'IfcPropertySet') {
        readIfcRefList(definition?.HasProperties).forEach((propertyId) => {
          const property = api.GetLine(modelID, propertyId);
          const propertyType = getSafeIfcTypeName(api, property?.type, 'IfcProperty');
          const propertyName = normalizeIfcText(property?.Name) || `${propertyType}#${propertyId}`;
          const key = `${definitionName}.${propertyName}`;
          const value = this.renderPropertyValue(api, modelID, property, propertyType);
          if (value) attributes[key] = makeAttribute(key, value, 'pset');
        });
      }

      if (definitionType === 'IfcElementQuantity') {
        readIfcRefList(definition?.Quantities).forEach((quantityId) => {
          const quantity = api.GetLine(modelID, quantityId);
          const quantityType = getSafeIfcTypeName(api, quantity?.type, 'IfcPhysicalQuantity');
          const quantityName = normalizeIfcText(quantity?.Name) || `${quantityType}#${quantityId}`;
          const key = `${definitionName}.${quantityName}`;
          const rendered = this.readQuantityValue(quantity);
          if (rendered) quantities[key] = makeQuantity(key, rendered.value, rendered.unit, 'qto');
        });
      }
    });

    return {
      attributes,
      quantities,
      psetSignature: psetSignatureParts.sort().join(' | '),
    };
  }

  private renderPropertyValue(api: any, modelID: number, property: any, propertyType: string) {
    if (propertyType === 'IfcPropertySingleValue') return normalizeIfcText(property?.NominalValue);
    if (propertyType === 'IfcPropertyEnumeratedValue') return normalizeIfcText(property?.EnumerationValues);
    if (propertyType === 'IfcPropertyListValue') return normalizeIfcText(property?.ListValues);
    if (propertyType === 'IfcPropertyBoundedValue') {
      const lower = normalizeIfcText(property?.LowerBoundValue);
      const upper = normalizeIfcText(property?.UpperBoundValue);
      return [lower, upper].filter(Boolean).join(' .. ');
    }
    if (propertyType === 'IfcPropertyReferenceValue') {
      const referenceId = readIfcRef(property?.PropertyReference);
      if (referenceId === null) return '';
      const referenceLine = api.GetLine(modelID, referenceId);
      return summarizeRelatedLine(getSafeIfcTypeName(api, referenceLine?.type), referenceLine);
    }
    return '';
  }

  private readQuantityValue(quantity: any): { value: number; unit: string } | null {
    const valueKeys: Array<[string, string]> = [
      ['LengthValue', 'm'],
      ['AreaValue', 'm2'],
      ['VolumeValue', 'm3'],
      ['CountValue', 'count'],
      ['WeightValue', 'kg'],
      ['TimeValue', 'h'],
    ];

    for (const [key, unit] of valueKeys) {
      const value = unwrapIfcValue(quantity?.[key]);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return { value, unit };
      }
    }

    return null;
  }

  private collectGeometryData(api: any, modelID: number, expressID: number) {
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    let meshCount = 0;
    let geometrySurfaceArea = 0;
    let geometrySignedVolume = 0;

    const empty = {
      signature: '',
      bboxVolume: 0,
      bboxSurfaceArea: 0,
      geometryVolume: 0,
      geometrySurfaceArea: 0,
      sizeX: 0,
      sizeY: 0,
      sizeZ: 0,
    };

    try {
      // Bug fix 2026-05-12: this used `api.StreamMeshes` which does NOT
      // exist on web-ifc-three's IfcAPI — the call always threw and the
      // catch below masked the failure, leaving Derived.GeometryVolume /
      // BBoxVolume permanently at 0. Use GetFlatMesh instead (same shape:
      // returns a flatMesh with a `geometries` vector).
      const flatMesh = api.GetFlatMesh(modelID, expressID);
      if (flatMesh) {
        meshCount += 1;
        for (let geometryIndex = 0; geometryIndex < flatMesh.geometries.size(); geometryIndex += 1) {
          const placedGeometry = flatMesh.geometries.get(geometryIndex);
          const geometry = api.GetGeometry(modelID, placedGeometry.geometryExpressID);
          const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
          const indices = typeof api.GetIndexArray === 'function' && typeof geometry.GetIndexData === 'function' && typeof geometry.GetIndexDataSize === 'function'
            ? api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
            : null;

          const readPoint = (vertexRef: number) => applyFlatMatrix(
            vertices[vertexRef * 6],
            vertices[vertexRef * 6 + 1],
            vertices[vertexRef * 6 + 2],
            placedGeometry.flatTransformation,
          );

          for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 6) {
            const point = applyFlatMatrix(
              vertices[vertexIndex],
              vertices[vertexIndex + 1],
              vertices[vertexIndex + 2],
              placedGeometry.flatTransformation,
            );
            mins[0] = Math.min(mins[0], point.x);
            mins[1] = Math.min(mins[1], point.y);
            mins[2] = Math.min(mins[2], point.z);
            maxs[0] = Math.max(maxs[0], point.x);
            maxs[1] = Math.max(maxs[1], point.y);
            maxs[2] = Math.max(maxs[2], point.z);
          }

          if (indices && indices.length >= 3) {
            for (let indexIndex = 0; indexIndex + 2 < indices.length; indexIndex += 3) {
              const a = readPoint(indices[indexIndex]);
              const b = readPoint(indices[indexIndex + 1]);
              const c = readPoint(indices[indexIndex + 2]);
              geometrySurfaceArea += triangleArea(a, b, c);
              geometrySignedVolume += signedTriangleVolume(a, b, c);
            }
          } else {
            for (let vertexIndex = 0; vertexIndex + 17 < vertices.length; vertexIndex += 18) {
              const a = applyFlatMatrix(vertices[vertexIndex], vertices[vertexIndex + 1], vertices[vertexIndex + 2], placedGeometry.flatTransformation);
              const b = applyFlatMatrix(vertices[vertexIndex + 6], vertices[vertexIndex + 7], vertices[vertexIndex + 8], placedGeometry.flatTransformation);
              const c = applyFlatMatrix(vertices[vertexIndex + 12], vertices[vertexIndex + 13], vertices[vertexIndex + 14], placedGeometry.flatTransformation);
              geometrySurfaceArea += triangleArea(a, b, c);
              geometrySignedVolume += signedTriangleVolume(a, b, c);
            }
          }

          if (typeof geometry.delete === 'function') geometry.delete();
        }
        if (typeof flatMesh.delete === 'function') flatMesh.delete();
      }
    } catch {
      return empty;
    }

    if (meshCount === 0 || !Number.isFinite(mins[0]) || !Number.isFinite(maxs[0])) {
      return empty;
    }

    const sizeX = maxs[0] - mins[0];
    const sizeY = maxs[1] - mins[1];
    const sizeZ = maxs[2] - mins[2];
    const centerX = (mins[0] + maxs[0]) / 2;
    const centerY = (mins[1] + maxs[1]) / 2;
    const centerZ = (mins[2] + maxs[2]) / 2;
    const bboxVolume = Math.max(0, sizeX * sizeY * sizeZ);
    const bboxSurfaceArea = Math.max(0, 2 * (sizeX * sizeY + sizeY * sizeZ + sizeX * sizeZ));
    const geometryVolume = Math.abs(geometrySignedVolume);

    return {
      signature: [
        `bbox=${roundMetric(sizeX)}x${roundMetric(sizeY)}x${roundMetric(sizeZ)}`,
        `center=${roundMetric(centerX)},${roundMetric(centerY)},${roundMetric(centerZ)}`,
        `meshes=${meshCount}`,
        `garea=${roundMetric(geometrySurfaceArea)}`,
        `gvol=${roundMetric(geometryVolume)}`,
      ].join(' | '),
      bboxVolume,
      bboxSurfaceArea,
      geometryVolume,
      geometrySurfaceArea,
      sizeX,
      sizeY,
      sizeZ,
    };
  }

  private collectSpatialLocation(api: any, modelID: number, expressID: number, elementType: string) {
    const inverseLine = api.GetLine(modelID, expressID, false, true);
    const relationIds = readIfcRefList(inverseLine?.ContainedInStructure);

    for (const relationId of relationIds) {
      const relation = api.GetLine(modelID, relationId);
      let currentId = readIfcRef(relation?.RelatingStructure);
      const visited = new Set<number>();
      const ancestors: Array<{ type: string; name: string }> = [];

      while (currentId !== null && !visited.has(currentId)) {
        visited.add(currentId);
        const line = api.GetLine(modelID, currentId, false, true);
        if (!line) break;
        const typeName = getSafeIfcTypeName(api, line?.type, 'IfcSpatialStructureElement');
        const name = normalizeIfcText(line?.LongName) || normalizeIfcText(line?.Name) || humanizeIfcName(typeName);
        ancestors.unshift({ type: typeName, name: humanizeIfcName(name) });
        const parentRelationId = readIfcRefList(line?.Decomposes)[0];
        if (!parentRelationId) break;
        const parentRelation = api.GetLine(modelID, parentRelationId);
        currentId = readIfcRef(parentRelation?.RelatingObject);
      }

      if (ancestors.length > 0) {
        return buildSpatialLocation(ancestors, elementType);
      }
    }

    return buildSpatialLocation([], elementType);
  }

  async compareModels(baseComps: BimComponent[], revComps: BimComponent[]): Promise<VoComparisonResults> {
    return compareModels(baseComps, revComps);
  }

  /**
   * Highlight and zoom the camera to a single element by expressID.
   * Creates a bright "focus" subset and fits the camera to its bounding box.
   * Returns false if the model isn't loaded or the subset couldn't be created.
   */
  focusOnExpressId(expressID: number): boolean {
    if (!this.ifcModel) return false;
    const manager = this.ifcLoader.ifcManager;
    const modelID = this.ifcModel.modelID;

    // Remove previous focus highlight
    try {
      manager.removeSubset(modelID, this.matFocused, 'vo_focus');
    } catch {
      // No previous focus subset — safe to ignore.
    }

    try {
      const subset = manager.createSubset({
        modelID,
        ids: [expressID],
        material: this.matFocused,
        removePrevious: true,
        customID: 'vo_focus',
      });
      if (!subset) return false;

      // Fit camera to the focused element's bounding box
      const box = new THREE.Box3().setFromObject(subset);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.length() * 0.5, 0.5);
        const halfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
        const distance = (radius / Math.tan(halfFov)) * 2.5;
        const direction = new THREE.Vector3(1, 0.6, 0.8).normalize();

        this.camera.position.copy(center.clone().addScaledVector(direction, distance));
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
      }

      return true;
    } catch {
      return false;
    }
  }

  highlightComparison(results: VoComparisonResults) {
    if (!this.ifcModel) return;
    const manager = this.ifcLoader.ifcManager;
    const modelID = this.ifcModel.modelID;

    try {
      manager.removeSubset(modelID, this.matAdded, 'vo_added');
      manager.removeSubset(modelID, this.matModified, 'vo_modified');
      manager.removeSubset(modelID, this.matFocused, 'vo_focus');
    } catch {
      // Ignore missing subsets.
    }

    const addedIds = results.added.map((component) => component.expressID);
    const modifiedIds = results.modified.map((component) => component.rev.expressID);

    if (addedIds.length > 0) {
      manager.createSubset({ modelID, ids: addedIds, material: this.matAdded, removePrevious: true, customID: 'vo_added' });
    }
    if (modifiedIds.length > 0) {
      manager.createSubset({ modelID, ids: modifiedIds, material: this.matModified, removePrevious: true, customID: 'vo_modified' });
    }
  }

  // ─── Feature 1: Enhanced VO Diff Visualization ─────────────────────

  applyDiffVisualization(results: VoComparisonResults) {
    if (!this.ifcModel) return;

    // Clear previous diff state first
    this.clearDiffVisualization();

    const addedIds = new Set(results.added.map((c) => c.expressID));
    const deletedIds = new Set(results.deleted.map((c) => c.expressID));
    const modifiedIds = new Set(results.modified.map((m) => m.rev.expressID));

    const matDiffAdded = new THREE.MeshLambertMaterial({ color: 0x22c55e, opacity: 0.85, transparent: true, side: THREE.DoubleSide });
    const matDiffDeleted = new THREE.MeshLambertMaterial({ color: 0xef4444, opacity: 0.85, transparent: true, side: THREE.DoubleSide });
    const matDiffModified = new THREE.MeshLambertMaterial({ color: 0xf59e0b, opacity: 0.85, transparent: true, side: THREE.DoubleSide });
    const matDiffNeutral = new THREE.MeshLambertMaterial({ color: 0xd7dee6, opacity: 0.15, transparent: true, side: THREE.DoubleSide });

    this.ifcModel.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const expressID = (mesh as unknown as Record<string, unknown>).expressID as number | undefined
        ?? (mesh.geometry?.attributes?.expressID ? undefined : undefined);

      // Try to get expressID from geometry subset data or userData
      const eid = expressID ?? (mesh.userData?.expressID as number | undefined);
      if (eid == null) {
        // For non-IFC meshes, just make them transparent
        this.originalMaterials.set(mesh.id, Array.isArray(mesh.material) ? [...mesh.material] : mesh.material);
        mesh.material = matDiffNeutral;
        return;
      }

      this.originalMaterials.set(mesh.id, Array.isArray(mesh.material) ? [...mesh.material] : mesh.material);

      if (addedIds.has(eid)) {
        mesh.material = matDiffAdded;
      } else if (deletedIds.has(eid)) {
        mesh.material = matDiffDeleted;
      } else if (modifiedIds.has(eid)) {
        mesh.material = matDiffModified;
      } else {
        mesh.material = matDiffNeutral;
      }
    });

    this.diffActive = true;

    // Also use subset API for highlighting (more reliable with web-ifc-three)
    this.highlightComparison(results);
  }

  clearDiffVisualization() {
    if (!this.diffActive || !this.ifcModel) return;

    this.ifcModel.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const original = this.originalMaterials.get(mesh.id);
      if (original) {
        mesh.material = original;
      }
    });

    this.originalMaterials.clear();
    this.diffActive = false;

    // Remove subsets
    if (this.ifcModel) {
      const manager = this.ifcLoader.ifcManager;
      const modelID = this.ifcModel.modelID;
      try {
        manager.removeSubset(modelID, this.matAdded, 'vo_added');
        manager.removeSubset(modelID, this.matModified, 'vo_modified');
        manager.removeSubset(modelID, this.matFocused, 'vo_focus');
      } catch {
        // Ignore missing subsets
      }
    }
  }

  // ─── Feature 2: Storey Filtering ───────────────────────────────────

  getStoreys(): StoreyInfo[] {
    if (!this.ifcModel) return [];
    if (this.storeyList.length > 0) return this.storeyList;

    const handle = this.getIfcHandle();
    if (!handle) return [];
    const { api, modelID } = handle;

    try {
      const storeyIds = api.GetLineIDsWithType(modelID, IFCBUILDINGSTOREY);
      if (!storeyIds) return [];

      const idList: number[] = [];
      if (Array.isArray(storeyIds)) {
        idList.push(...storeyIds);
      } else if (typeof storeyIds.size === 'function') {
        for (let i = 0; i < storeyIds.size(); i++) {
          idList.push(storeyIds.get(i));
        }
      }

      for (const storeyId of idList) {
        try {
          const line = api.GetLine(modelID, storeyId);
          const name = normalizeIfcText(line?.Name) || normalizeIfcText(line?.LongName) || `Storey #${storeyId}`;
          const elevation = (() => {
            const val = unwrapIfcValue(line?.Elevation);
            return typeof val === 'number' && Number.isFinite(val) ? val : 0;
          })();
          this.storeyList.push({ id: storeyId, name, elevation });
        } catch {
          // skip broken storey
        }
      }

      this.storeyList.sort((a, b) => a.elevation - b.elevation);

      // Build storey -> expressIDs mapping via IFCRELCONTAINEDINSPATIALSTRUCTURE
      const IFCRELCONTAINED = 3242617779; // IFCRELCONTAINEDINSPATIALSTRUCTURE
      try {
        const relIds = api.GetLineIDsWithType(modelID, IFCRELCONTAINED);
        if (!relIds) return this.storeyList;

        const relIdList: number[] = [];
        if (Array.isArray(relIds)) {
          relIdList.push(...relIds);
        } else if (typeof relIds.size === 'function') {
          for (let i = 0; i < relIds.size(); i++) {
            relIdList.push(relIds.get(i));
          }
        }

        const storeyIdSet = new Set(this.storeyList.map((s) => s.id));
        for (const relId of relIdList) {
          try {
            const rel = api.GetLine(modelID, relId);
            const structureId = readIfcRef(rel?.RelatingStructure);
            if (structureId == null || !storeyIdSet.has(structureId)) continue;

            const elementIds = readIfcRefList(rel?.RelatedElements);
            const existing = this.storeyMap.get(structureId) ?? [];
            existing.push(...elementIds);
            this.storeyMap.set(structureId, existing);
          } catch {
            // skip broken relation
          }
        }
      } catch {
        // relation walk failed
      }

      return this.storeyList;
    } catch {
      return [];
    }
  }

  filterByStorey(storeyId: number | null) {
    if (!this.ifcModel) return;

    if (storeyId === null) {
      // Show all
      this.ifcModel.traverse((child: THREE.Object3D) => {
        child.visible = true;
      });
      return;
    }

    const allowedIds = new Set(this.storeyMap.get(storeyId) ?? []);
    if (allowedIds.size === 0) return;

    const manager = this.ifcLoader.ifcManager;
    const modelID = this.ifcModel.modelID;

    // Use subset approach: create a subset for the storey elements
    try {
      manager.removeSubset(modelID, undefined, 'vo_storey_filter');
    } catch {
      // ignore
    }

    // Toggle visibility on the model traversal
    this.ifcModel.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const eid = (mesh as unknown as Record<string, unknown>).expressID as number | undefined
        ?? (mesh.userData?.expressID as number | undefined);

      if (eid != null) {
        mesh.visible = allowedIds.has(eid);
      }
    });
  }

  // ─── Feature 3: Element Type Filtering ─────────────────────────────

  getElementTypes(): ElementTypeInfo[] {
    if (!this.ifcModel) return [];

    const handle = this.getIfcHandle();
    if (!handle) return [];
    const { api, modelID } = handle;

    const typeCounts = new Map<number, { name: string; count: number }>();

    for (const typeCode of SUPPORTED_ELEMENT_TYPES) {
      try {
        const ids = api.GetLineIDsWithType(modelID, typeCode);
        if (!ids) continue;
        let count = 0;
        const idList: number[] = [];
        if (Array.isArray(ids)) {
          count = ids.length;
          idList.push(...ids);
        } else if (typeof ids.size === 'function') {
          count = ids.size();
          for (let i = 0; i < count; i++) {
            idList.push(ids.get(i));
          }
        }
        if (count > 0) {
          const name = getSafeIfcTypeName(api, typeCode, 'IfcElement');
          typeCounts.set(typeCode, { name, count });
          // Cache expressID -> typeCode mapping
          for (const eid of idList) {
            this.expressIdToType.set(eid, typeCode);
          }
        }
      } catch {
        // skip
      }
    }

    return [...typeCounts.entries()]
      .map(([typeCode, info]) => ({ typeCode, name: info.name, count: info.count }))
      .sort((a, b) => b.count - a.count);
  }

  filterByType(typeCodes: number[] | null) {
    if (!this.ifcModel) return;

    if (typeCodes === null) {
      // Show all
      this.ifcModel.traverse((child: THREE.Object3D) => {
        child.visible = true;
      });
      return;
    }

    const allowedTypes = new Set(typeCodes);

    // Build set of allowed expressIDs from cached type mapping
    const allowedIds = new Set<number>();
    for (const [eid, tc] of this.expressIdToType.entries()) {
      if (allowedTypes.has(tc)) allowedIds.add(eid);
    }

    this.ifcModel.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const eid = (mesh as unknown as Record<string, unknown>).expressID as number | undefined
        ?? (mesh.userData?.expressID as number | undefined);

      if (eid != null) {
        mesh.visible = allowedIds.has(eid);
      }
    });
  }

  // ─── Feature 4: Click to View Properties ───────────────────────────

  enablePicking(callback: (props: ElementProperties | null) => void) {
    this.disablePicking();
    this.pickCallback = callback;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this.pickHandler = (event: MouseEvent) => {
      if (!this.ifcModel || !this.pickCallback) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, this.camera);
      // Only intersect meshes (skip LineSegments/edges which lack faceIndex)
      const allIntersects = raycaster.intersectObject(this.ifcModel, true);
      const intersects = allIntersects.filter(
        (i) => i.object instanceof THREE.Mesh && i.faceIndex != null,
      );

      if (intersects.length === 0) {
        this.pickCallback(null);
        return;
      }

      const hit = intersects[0];
      const faceIndex = hit.faceIndex!;

      // Try to get expressID from the geometry
      const mesh = hit.object as THREE.Mesh;
      const geometry = mesh.geometry;
      let expressId: number | undefined;

      // web-ifc-three stores expressIDs in a buffer attribute
      const expressIDAttr = geometry.attributes?.expressID;
      if (expressIDAttr) {
        expressId = expressIDAttr.getX(faceIndex * 3);
      }

      if (expressId == null) {
        expressId = (mesh as unknown as Record<string, unknown>).expressID as number | undefined
          ?? (mesh.userData?.expressID as number | undefined);
      }

      if (expressId == null) {
        this.pickCallback(null);
        return;
      }

      // Highlight picked element
      this.focusOnExpressId(expressId);

      // Get properties
      const handle = this.getIfcHandle();
      if (!handle) {
        this.pickCallback({ expressId, ifcType: '', name: '', globalId: '', storey: '', properties: {}, quantities: {} });
        return;
      }

      const { api, modelID } = handle;
      try {
        const line = api.GetLine(modelID, expressId, false, true);
        const ifcType = getSafeIfcTypeName(api, line?.type, 'IfcElement');
        const name = normalizeIfcText(line?.Name);
        const globalId = normalizeIfcText(line?.GlobalId);

        // Get storey
        let storey = '';
        const storeys = this.getStoreys();
        for (const s of storeys) {
          const ids = this.storeyMap.get(s.id);
          if (ids?.includes(expressId)) {
            storey = s.name;
            break;
          }
        }

        // Get property sets
        const properties: Record<string, string> = {};
        const quantities: Record<string, string> = {};

        const definitionIds = new Set<number>();
        readIfcRefList(line?.IsDefinedBy)
          .map((relId: number) => { try { return api.GetLine(modelID, relId); } catch { return null; } })
          .filter((rel: unknown): rel is Record<string, unknown> => rel != null && getSafeIfcTypeName(api, (rel as Record<string, unknown>)?.type) === 'IfcRelDefinesByProperties')
          .forEach((rel: Record<string, unknown>) => {
            const defId = readIfcRef(rel.RelatingPropertyDefinition);
            if (defId !== null) definitionIds.add(defId);
          });

        for (const defId of definitionIds) {
          try {
            const def = api.GetLine(modelID, defId);
            const defType = getSafeIfcTypeName(api, def?.type, 'IfcPropertyDefinition');
            const defName = normalizeIfcText(def?.Name) || defType;

            if (defType === 'IfcPropertySet') {
              readIfcRefList(def?.HasProperties).forEach((propId: number) => {
                try {
                  const prop = api.GetLine(modelID, propId);
                  const propName = normalizeIfcText(prop?.Name);
                  const propValue = normalizeIfcText(prop?.NominalValue);
                  if (propName && propValue) {
                    properties[`${defName}.${propName}`] = propValue;
                  }
                } catch {
                  // skip
                }
              });
            }

            if (defType === 'IfcElementQuantity') {
              readIfcRefList(def?.Quantities).forEach((qId: number) => {
                try {
                  const q = api.GetLine(modelID, qId);
                  const qName = normalizeIfcText(q?.Name);
                  const qVal = this.readQuantityValue(q);
                  if (qName && qVal) {
                    quantities[`${defName}.${qName}`] = `${qVal.value.toFixed(4)} ${qVal.unit}`;
                  }
                } catch {
                  // skip
                }
              });
            }
          } catch {
            // skip broken definition
          }
        }

        this.pickCallback({ expressId, ifcType, name, globalId, storey, properties, quantities });
      } catch {
        this.pickCallback({ expressId, ifcType: '', name: '', globalId: '', storey: '', properties: {}, quantities: {} });
      }
    };

    this.renderer.domElement.addEventListener('click', this.pickHandler);
  }

  disablePicking() {
    if (this.pickHandler) {
      this.renderer.domElement.removeEventListener('click', this.pickHandler);
      this.pickHandler = null;
    }
    this.pickCallback = null;
  }

  // ─── Feature 5: Transparency / Isolation Mode ─────────────────────

  isolateElements(expressIds: number[]) {
    if (!this.ifcModel) return;
    this.clearIsolation();

    const isolatedSet = new Set(expressIds);
    const matIsolateHighlight = new THREE.MeshLambertMaterial({ color: 0x38bdf8, opacity: 0.95, transparent: true, side: THREE.DoubleSide });
    const matIsolateGhost = new THREE.MeshLambertMaterial({ color: 0xd7dee6, opacity: 0.08, transparent: true, side: THREE.DoubleSide });

    this.ifcModel.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      this.isolationOriginalMaterials.set(mesh.id, Array.isArray(mesh.material) ? [...mesh.material] : mesh.material);

      const eid = (mesh as unknown as Record<string, unknown>).expressID as number | undefined
        ?? (mesh.userData?.expressID as number | undefined);

      if (eid != null && isolatedSet.has(eid)) {
        mesh.material = matIsolateHighlight;
      } else {
        mesh.material = matIsolateGhost;
      }
    });

    this.isolationActive = true;
  }

  clearIsolation() {
    if (!this.isolationActive || !this.ifcModel) return;

    this.ifcModel.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const original = this.isolationOriginalMaterials.get(mesh.id);
      if (original) {
        mesh.material = original;
      }
    });

    this.isolationOriginalMaterials.clear();
    this.isolationActive = false;
  }

  // ─── Feature 6: Measurement Tool ──────────────────────────────────

  enableMeasurement(callback: (distance: number, points: [THREE.Vector3, THREE.Vector3]) => void) {
    this.disableMeasurement();
    this.measureCallback = callback;
    this.measureFirstPoint = null;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this.measureHandler = (event: MouseEvent) => {
      if (!this.ifcModel || !this.measureCallback) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, this.camera);
      // Only intersect meshes (skip LineSegments/edges)
      const allMeasureIntersects = raycaster.intersectObject(this.ifcModel, true);
      const measureIntersects = allMeasureIntersects.filter(
        (i) => i.object instanceof THREE.Mesh,
      );
      if (measureIntersects.length === 0) return;

      const point = measureIntersects[0].point.clone();

      if (!this.measureFirstPoint) {
        // First click: place marker
        this.measureFirstPoint = point;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6 }),
        );
        sphere.position.copy(point);
        sphere.name = 'measure-marker';
        this.scene.add(sphere);
        this.measureObjects.push(sphere);
      } else {
        // Second click: complete measurement
        const start = this.measureFirstPoint;
        const end = point;

        // Place second marker
        const sphere2 = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6 }),
        );
        sphere2.position.copy(end);
        sphere2.name = 'measure-marker';
        this.scene.add(sphere2);
        this.measureObjects.push(sphere2);

        // Draw dashed line
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const lineMaterial = new THREE.LineDashedMaterial({
          color: 0x3b82f6,
          dashSize: 0.15,
          gapSize: 0.08,
          linewidth: 1,
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.computeLineDistances();
        line.name = 'measure-line';
        this.scene.add(line);
        this.measureObjects.push(line);

        // Distance text sprite
        const distance = start.distanceTo(end);
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const sprite = this.createTextSprite(`${distance.toFixed(3)} m`);
        sprite.position.copy(midpoint);
        sprite.position.y += 0.2;
        sprite.name = 'measure-label';
        this.scene.add(sprite);
        this.measureObjects.push(sprite);

        this.measureCallback(distance, [start, end]);
        this.measureFirstPoint = null;
      }
    };

    this.renderer.domElement.addEventListener('click', this.measureHandler);
  }

  disableMeasurement() {
    if (this.measureHandler) {
      this.renderer.domElement.removeEventListener('click', this.measureHandler);
      this.measureHandler = null;
    }
    this.measureCallback = null;
    this.measureFirstPoint = null;
  }

  clearMeasurements() {
    for (const obj of this.measureObjects) {
      this.scene.remove(obj);
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    }
    this.measureObjects = [];
    this.measureFirstPoint = null;
  }

  private createTextSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
    ctx.fill();
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.375, 1);
    return sprite;
  }

  // ─── Feature 7: Screenshot Export ──────────────────────────────────

  captureScreenshot(): string {
    // Re-render trick since preserveDrawingBuffer is not set
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  captureScreenshotBlob(): Promise<Blob> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve, reject) => {
      this.renderer.domElement.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to capture screenshot blob'));
        }
      }, 'image/png');
    });
  }

  // ─── Feature 8: Draggable Clipping Plane ──────────────────────────

  setClippingHeight(normalizedValue: number) {
    if (!this.ifcModel) return;

    const box = new THREE.Box3().setFromObject(this.ifcModel);
    if (box.isEmpty()) return;

    const clamped = Math.max(0, Math.min(1, normalizedValue));
    const yValue = box.min.y + (box.max.y - box.min.y) * clamped;
    this.globalClipPlane.constant = yValue;

    // Ensure clipping is enabled
    if (!this.clippingEnabled) {
      this.toggleClipping();
    }
  }
}



