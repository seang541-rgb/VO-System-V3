/**
 * BimEngine — Three.js 3D renderer and IFC model orchestrator.
 *
 * Rendering, camera, lighting and highlight logic live here.
 * IFC data extraction (properties, geometry, relationships) is
 * delegated to `src/ifc/ifc-extractor.ts` so each file has a
 * single responsibility.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import {
  IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCDOOR, IFCWINDOW,
  IFCWALL, IFCFOOTING, IFCSTAIR, IFCCURTAINWALL, IFCPIPESEGMENT,
  IFCDUCTSEGMENT, IFCSANITARYTERMINAL, IFCCOVERING, IFCFLOWSEGMENT,
  IFCFLOWTERMINAL, IFCFLOWCONTROLLER, IFCFLOWFITTING, IFCFLOWMOVINGDEVICE,
  IFCFLOWSTORAGEDEVICE, IFCFLOWTREATMENTDEVICE, IFCDISTRIBUTIONELEMENT,
  IFCMEMBER, IFCRAILING, IFCPLATE, IFCDISCRETEACCESSORY,
  IFCMECHANICALFASTENER, IFCFASTENER, IFCENERGYCONVERSIONDEVICE,
  IFCROOF, IFCRAMP, IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT,
  IFCELEMENTASSEMBLY, IFCCABLECARRIERSEGMENT, IFCEQUIPMENTELEMENT,
  IFCOPENINGELEMENT,
} from 'web-ifc';
import type { BimComponent, VoComparisonResults } from './vo-diff-core';
import { compareModels } from './vo-diff-core';
import { buildComponentSnapshot, extractComponentsFromStepText } from './ifc/ifc-extractor';
import type { IfcAPI } from './ifc/web-ifc-api';

export { buildCommercialBreakdown } from './vo-diff-core';
export type { BimFieldChange, BimComponent, ModifiedBimComponent, VoComparisonResults, VoCommercialAction, VoCommercialBreakdown, BqLineItem, BqMappingContext } from './vo-diff-core';

// ── Supported IFC element types ─────────────────────────────────────

const SUPPORTED_ELEMENT_TYPES = [
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCDOOR,
  IFCWINDOW, IFCFOOTING, IFCSTAIR, IFCCURTAINWALL, IFCPIPESEGMENT,
  IFCDUCTSEGMENT, IFCSANITARYTERMINAL, IFCCOVERING, IFCFLOWSEGMENT,
  IFCFLOWTERMINAL, IFCFLOWCONTROLLER, IFCFLOWFITTING, IFCFLOWMOVINGDEVICE,
  IFCFLOWSTORAGEDEVICE, IFCFLOWTREATMENTDEVICE, IFCDISTRIBUTIONELEMENT,
  IFCMEMBER, IFCRAILING, IFCPLATE, IFCDISCRETEACCESSORY,
  IFCMECHANICALFASTENER, IFCFASTENER, IFCENERGYCONVERSIONDEVICE,
  IFCROOF, IFCRAMP, IFCBUILDINGELEMENTPROXY, IFCFURNISHINGELEMENT,
  IFCELEMENTASSEMBLY, IFCCABLECARRIERSEGMENT, IFCEQUIPMENTELEMENT,
  IFCOPENINGELEMENT,
];

// ── Mesh material type guard ────────────────────────────────────────

interface ThreeMesh extends THREE.Object3D {
  isMesh: true;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  name: string;
  userData: Record<string, unknown>;
}

function isMesh(child: THREE.Object3D): child is ThreeMesh {
  return 'isMesh' in child && (child as ThreeMesh).isMesh === true;
}

interface ThreeMaterial extends THREE.Material {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
}

// ── BimEngine class ─────────────────────────────────────────────────

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
  ifcModel: THREE.Object3D & { modelID?: number } | null = null;
  onLog?: (text: string) => void;

  /**
   * Public handle for the raw web-ifc API + the currently-loaded model ID.
   * Used by the audit engine so it can run pset walks without going through
   * this class. Returns null when nothing is loaded.
   */
  getIfcHandle(): { api: IfcAPI; modelID: number } | null {
    if (!this.ifcModel) return null;
    const loader = this.ifcLoader as unknown as { ifcManager?: { ifcAPI?: IfcAPI } };
    const api = loader.ifcManager?.ifcAPI;
    const modelID = this.ifcModel.modelID;
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

    // Lighting
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

    // Clipping & materials
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

  /** Remove the loaded IFC model from the scene and clear extracted components. */
  clearScene() {
    if (this.ifcModel) {
      this.scene.remove(this.ifcModel);
      this.ifcModel = null;
    }
    this.components = [];
    // Remove any diff highlight meshes that may linger
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child.userData?.diffHighlight) toRemove.push(child);
    });
    toRemove.forEach((obj) => this.scene.remove(obj));
  }

  dispose() {
    window.removeEventListener('resize', this.onWindowResize);
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.renderer.dispose();
  }

  // ── Animation & resize ──────────────────────────────────────────

  onWindowResize = () => {
    if (!this.container.clientWidth) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ── Model presentation ──────────────────────────────────────────

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

    object.traverse((child) => {
      if (!isMesh(child)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const typeHint = `${child.name || ''} ${materials.map((m) => m.name || '').join(' ')}`.toLowerCase();
      const isGlazing = /glass|window|glazing|curtain/.test(typeHint);

      if (child.geometry?.attributes?.normal == null && typeof child.geometry?.computeVertexNormals === 'function') {
        child.geometry.computeVertexNormals();
      }

      materials.forEach((mat) => {
        const m = mat as ThreeMaterial;
        if (m.color?.isColor) {
          m.color.lerp(isGlazing ? glassColor : neutralColor, isGlazing ? 0.55 : 0.72);
        }
        if (m.emissive?.isColor) {
          m.emissive.set(isGlazing ? 0x1d4f63 : 0x9aa7b2);
          m.emissiveIntensity = isGlazing ? 0.08 : 0.03;
        }
        if ('roughness' in m) (m as { roughness: number }).roughness = 0.92;
        if ('metalness' in m) (m as { metalness: number }).metalness = 0;
        m.side = THREE.DoubleSide;
        m.polygonOffset = true;
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 1;
        m.transparent = isGlazing;
        m.opacity = isGlazing ? 0.42 : 1;
        m.needsUpdate = true;
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

  // ── Camera ──────────────────────────────────────────────────────

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

  // ── Clipping ────────────────────────────────────────────────────

  toggleClipping = () => {
    this.clippingEnabled = !this.clippingEnabled;
    const planes = this.clippingEnabled ? [this.globalClipPlane] : [];
    [this.matAdded, this.matDeleted, this.matModified, this.matFocused].forEach((mat) => {
      mat.clippingPlanes = planes;
    });

    if (!this.ifcModel) return;
    this.ifcModel.traverse((child) => {
      if (!isMesh(child)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => { mat.clippingPlanes = planes; });
    });

    if (this.clippingEnabled) {
      const box = new THREE.Box3().setFromObject(this.ifcModel);
      this.globalClipPlane.constant = (box.max.y + box.min.y) / 2;
    }
  };

  // ── IFC loading & extraction ────────────────────────────────────

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
        this.components = await extractComponentsFromStepText(buffer, onProgress);
      }
      return this.components;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'unknown error';
      onProgress?.(18, `3D parse failed (${errMsg}). Falling back to STEP text parsing...`);
      this.components = await extractComponentsFromStepText(buffer, onProgress);
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
    const modelID = (this.ifcModel as THREE.Object3D & { modelID: number }).modelID;
    const handle = this.getIfcHandle();
    if (!handle) return;

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
          const component = await buildComponentSnapshot(handle.api, modelID, expressID, props, manager);
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

  // ── Model comparison ────────────────────────────────────────────

  async compareModels(baseComps: BimComponent[], revComps: BimComponent[]): Promise<VoComparisonResults> {
    return compareModels(baseComps, revComps);
  }

  // ── 3D highlight & focus ────────────────────────────────────────

  focusOnExpressId(expressID: number): boolean {
    if (!this.ifcModel) return false;
    const manager = this.ifcLoader.ifcManager;
    const modelID = (this.ifcModel as THREE.Object3D & { modelID: number }).modelID;

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
    const modelID = (this.ifcModel as THREE.Object3D & { modelID: number }).modelID;

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
}
