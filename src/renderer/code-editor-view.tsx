import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef
} from "react";

import {
  createCodeEditorController,
  type CodeEditorController
} from "./code-editor";
import type { ActiveBlockState } from "../../packages/editor-core/src";

export type CodeEditorHandle = {
  getContent: () => string;
  setContent: (content: string) => void;
  insertText: (text: string) => void;
};

type CodeEditorViewProps = {
  initialContent: string;
  loadRevision: number;
  onChange: (content: string) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
};

export const CodeEditorView = forwardRef<CodeEditorHandle, CodeEditorViewProps>(
  function CodeEditorView(
    { initialContent, loadRevision, onChange, onBlur, onActiveBlockChange },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<CodeEditorController | null>(null);
    const initialContentRef = useRef(initialContent);
    const latestLoadedContentRef = useRef(initialContent);
    const handleChange = useEffectEvent(onChange);
    const handleBlur = useEffectEvent(() => onBlur?.());
    const handleActiveBlockChange = useEffectEvent((state: ActiveBlockState) =>
      onActiveBlockChange?.(state)
    );

    useEffect(() => {
      if (!hostRef.current) {
        return undefined;
      }

      const controller = createCodeEditorController({
        parent: hostRef.current,
        initialContent: initialContentRef.current,
        onChange: (content) => handleChange(content),
        onBlur: () => handleBlur(),
        onActiveBlockChange: (state) => handleActiveBlockChange(state)
      });

      controllerRef.current = controller;

      return () => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }

        controller.destroy();
      };
    }, []);

    useEffect(() => {
      latestLoadedContentRef.current = initialContent;
    }, [initialContent]);

    useEffect(() => {
      controllerRef.current?.replaceDocument(latestLoadedContentRef.current);
    }, [loadRevision]);

    useImperativeHandle(
      ref,
      () => ({
        getContent: () => controllerRef.current?.getContent() ?? initialContent,
        setContent: (content: string) => {
          controllerRef.current?.replaceDocument(content);
        },
        insertText: (text: string) => {
          controllerRef.current?.insertText(text);
        }
      }),
      [initialContent]
    );

    return <div className="document-editor" ref={hostRef} />;
  }
);
