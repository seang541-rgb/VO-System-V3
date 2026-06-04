/// <reference types="vite/client" />

declare namespace Autodesk {
  namespace Viewing {
    class GuiViewer3D {
      constructor(container: HTMLElement, config?: Record<string, unknown>);
      start(): number;
      finish(): void;
      loadDocumentNode(doc: Document, bubble: BubbleNode): Promise<unknown>;
      setTheme(theme: string): void;
    }
    class Document {
      static load(urn: string, onSuccess: (doc: Document) => void, onError: (code: number, msg: string) => void): void;
      getRoot(): BubbleNode;
    }
    class BubbleNode {
      getDefaultGeometry(): BubbleNode;
    }
    function Initializer(options: { env: string; getAccessToken: (cb: (token: string, expire: number) => void) => void }, callback: () => void): void;
  }
}
