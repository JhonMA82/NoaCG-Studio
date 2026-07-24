import { useTemplateStore } from '../store/templateStore';
import ExportSurface from './ExportSurface';

/**
 * The Export dock panel — the STORE ADAPTER over ExportSurface. Everything the export
 * actually does (targets, the validation gate, the render section) lives in the surface, so
 * the same screen serves the wizard's export window and Home's saved graphics; this file's
 * whole job is to point it at the open project and feed the verdict back to the store.
 */
export default function ExportPanel() {
  const template = useTemplateStore((s) => s.template);
  const sampleData = useTemplateStore((s) => s.sampleData);
  const graphicId = useTemplateStore((s) => s.saved.graphicId);
  const previewError = useTemplateStore((s) => s.previewError);
  const setValidation = useTemplateStore((s) => s.setValidation);

  return (
    <ExportSurface
      template={template}
      sampleData={sampleData}
      graphicId={graphicId}
      runtimeError={previewError}
      onValidation={setValidation}
    />
  );
}
