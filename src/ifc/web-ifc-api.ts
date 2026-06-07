/**
 * Minimal type surface for the web-ifc IfcAPI object exposed
 * through web-ifc-three's IFCManager. Only the methods and shapes
 * actually used by our extraction code are typed here.
 *
 * web-ifc does not ship stable TypeScript declarations for its
 * runtime API — these interfaces are derived from runtime inspection
 * and the web-ifc source code.
 */

/** A single IFC entity line returned by `api.GetLine()`. */
export interface IfcLine {
  expressID?: number;
  type?: number;
  GlobalId?: unknown;
  Name?: unknown;
  LongName?: unknown;
  Description?: unknown;
  Tag?: unknown;
  ObjectType?: unknown;
  PredefinedType?: unknown;
  ObjectPlacement?: unknown;
  Representation?: unknown;

  // Inverse relationships (populated when `inverse = true`)
  IsTypedBy?: unknown;
  HasAssociations?: unknown;
  HasOpenings?: unknown;
  VoidsElements?: unknown;
  IsDefinedBy?: unknown;
  ContainedInStructure?: unknown;
  Decomposes?: unknown;
  HasPropertySets?: unknown;

  // IfcRelDefinesByProperties
  RelatingPropertyDefinition?: unknown;
  // IfcRelAssociatesMaterial
  RelatingMaterial?: unknown;
  // IfcRelVoidsElement
  RelatingBuildingElement?: unknown;
  // IfcRelFillsElement / IfcRelContainedInSpatialStructure
  RelatingStructure?: unknown;
  RelatingObject?: unknown;
  RelatingType?: unknown;
  RelatedOpeningElement?: unknown;

  // Property set / quantity fields
  HasProperties?: unknown;
  Quantities?: unknown;
  NominalValue?: unknown;
  EnumerationValues?: unknown;
  ListValues?: unknown;
  LowerBoundValue?: unknown;
  UpperBoundValue?: unknown;
  PropertyReference?: unknown;

  // Quantity value fields
  LengthValue?: unknown;
  AreaValue?: unknown;
  VolumeValue?: unknown;
  CountValue?: unknown;
  WeightValue?: unknown;
  TimeValue?: unknown;

  // Fallback props injected by ifc-step-fallback
  __typeName?: string;
  __fallbackMaterialSignature?: string;

  [key: string]: unknown;
}

/** Placed geometry returned from a FlatMesh's geometry vector. */
export interface IfcPlacedGeometry {
  geometryExpressID: number;
  flatTransformation: ArrayLike<number>;
}

/** A vector-like container returned by web-ifc (Emscripten). */
export interface IfcVector<T> {
  size(): number;
  get(index: number): T;
}

/** FlatMesh returned by `api.GetFlatMesh()`. */
export interface IfcFlatMesh {
  geometries: IfcVector<IfcPlacedGeometry>;
  delete?: () => void;
}

/** Geometry data returned by `api.GetGeometry()`. */
export interface IfcGeometry {
  GetVertexData(): number;
  GetVertexDataSize(): number;
  GetIndexData?(): number;
  GetIndexDataSize?(): number;
  delete?: () => void;
}

/** The subset of the web-ifc IfcAPI that our extraction code uses. */
export interface IfcAPI {
  GetLine(modelID: number, expressID: number, flatten?: boolean, inverse?: boolean): IfcLine;
  GetNameFromTypeCode?(typeCode: number): string;
  GetFlatMesh(modelID: number, expressID: number): IfcFlatMesh | null;
  GetGeometry(modelID: number, geometryExpressID: number): IfcGeometry;
  GetVertexArray(vertexData: number, vertexDataSize: number): Float32Array;
  GetIndexArray?(indexData: number, indexDataSize: number): Uint32Array;
}
