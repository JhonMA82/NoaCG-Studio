/**
 * The authored project-format registry.
 *
 * This is the one list used by graphics, video, AI requests, and creation UI. Exporters may
 * scale rendered media, but package exports always keep the authored width, height, and fps.
 */

export interface Resolution {
  width: number;
  height: number;
  label: string;
}

export type ProjectAspectId = '16:9' | '9:16' | '1:1';
export type ProjectFormatPresetId =
  | 'landscape-1080p'
  | 'landscape-2160p'
  | 'landscape-720p'
  | 'vertical-1080p'
  | 'vertical-720p'
  | 'square-1080p';

export type HostedMediaCapability = 'standard' | 'tier-dependent';

export interface ProjectFormatPreset extends Resolution {
  id: ProjectFormatPresetId;
  aspectId: ProjectAspectId;
  capabilities: {
    packages: true;
    hostedMedia: HostedMediaCapability;
  };
}

export interface AspectPreset {
  id: ProjectAspectId;
  label: string;
  resolutions: ProjectFormatPreset[];
}

export interface ProjectFrameRate {
  value: number;
  label: string;
}

export interface ProjectFormatSelection {
  aspectId: ProjectAspectId;
  resolutionId: ProjectFormatPresetId;
  fps: number;
}

export const PROJECT_FORMAT_PRESETS: ProjectFormatPreset[] = [
  {
    id: 'landscape-1080p',
    aspectId: '16:9',
    width: 1920,
    height: 1080,
    label: '1080p (1920×1080)',
    capabilities: { packages: true, hostedMedia: 'standard' },
  },
  {
    id: 'landscape-2160p',
    aspectId: '16:9',
    width: 3840,
    height: 2160,
    label: '4K UHD (3840×2160)',
    capabilities: { packages: true, hostedMedia: 'tier-dependent' },
  },
  {
    id: 'landscape-720p',
    aspectId: '16:9',
    width: 1280,
    height: 720,
    label: '720p (1280×720)',
    capabilities: { packages: true, hostedMedia: 'standard' },
  },
  {
    id: 'vertical-1080p',
    aspectId: '9:16',
    width: 1080,
    height: 1920,
    label: 'Vertical (1080×1920)',
    capabilities: { packages: true, hostedMedia: 'standard' },
  },
  {
    id: 'vertical-720p',
    aspectId: '9:16',
    width: 720,
    height: 1280,
    label: 'Vertical (720×1280)',
    capabilities: { packages: true, hostedMedia: 'standard' },
  },
  {
    id: 'square-1080p',
    aspectId: '1:1',
    width: 1080,
    height: 1080,
    label: 'Square (1080×1080)',
    capabilities: { packages: true, hostedMedia: 'standard' },
  },
];

export const ASPECTS: AspectPreset[] = [
  {
    id: '16:9',
    label: '16:9 Landscape',
    resolutions: PROJECT_FORMAT_PRESETS.filter((preset) => preset.aspectId === '16:9'),
  },
  {
    id: '9:16',
    label: '9:16 Vertical',
    resolutions: PROJECT_FORMAT_PRESETS.filter((preset) => preset.aspectId === '9:16'),
  },
  {
    id: '1:1',
    label: '1:1 Square',
    resolutions: PROJECT_FORMAT_PRESETS.filter((preset) => preset.aspectId === '1:1'),
  },
];

function canonicalResolution(preset: ProjectFormatPreset): Resolution {
  return { width: preset.width, height: preset.height, label: preset.label };
}

/** Compatibility export for code that only needs the landscape resolution list. */
export const RESOLUTIONS: Resolution[] = ASPECTS[0].resolutions.map(canonicalResolution);

export const PROJECT_FRAME_RATES: ProjectFrameRate[] = [
  { value: 25, label: '25 fps' },
  { value: 30, label: '30 fps' },
  { value: 50, label: '50 fps' },
  { value: 60, label: '60 fps' },
];

export const FPS_OPTIONS = [25, 30, 50, 60] as const;

export const DEFAULT_GRAPHICS_FORMAT: ProjectFormatSelection = {
  aspectId: '16:9',
  resolutionId: 'landscape-1080p',
  fps: 25,
};

export const DEFAULT_VIDEO_FORMAT: ProjectFormatSelection = {
  aspectId: '16:9',
  resolutionId: 'landscape-1080p',
  fps: 30,
};

export const DEFAULT_GRAPHICS_RESOLUTION = canonicalResolution(
  PROJECT_FORMAT_PRESETS.find((preset) => preset.id === DEFAULT_GRAPHICS_FORMAT.resolutionId)!,
);

export const DEFAULT_VIDEO_RESOLUTION = canonicalResolution(
  PROJECT_FORMAT_PRESETS.find((preset) => preset.id === DEFAULT_VIDEO_FORMAT.resolutionId)!,
);

export function projectFormatById(id: string): ProjectFormatPreset | undefined {
  return PROJECT_FORMAT_PRESETS.find((preset) => preset.id === id);
}

export function projectFormatsForAspect(aspectId: string): ProjectFormatPreset[] {
  return ASPECTS.find((aspect) => aspect.id === aspectId)?.resolutions ?? ASPECTS[0].resolutions;
}

export function projectFormatForResolution(
  resolution: Pick<Resolution, 'width' | 'height'>,
): ProjectFormatPreset | undefined {
  return PROJECT_FORMAT_PRESETS.find(
    (preset) => preset.width === resolution.width && preset.height === resolution.height,
  );
}

export function projectAspectForResolution(
  resolution: Pick<Resolution, 'width' | 'height'>,
): AspectPreset | undefined {
  const exact = projectFormatForResolution(resolution);
  if (exact) return ASPECTS.find((aspect) => aspect.id === exact.aspectId);
  const ratio = resolution.width / resolution.height;
  return ASPECTS.find((aspect) => {
    const sample = aspect.resolutions[0];
    return Math.abs(sample.width / sample.height - ratio) < 0.002;
  });
}

export function resolutionForSelection(selection: ProjectFormatSelection): Resolution {
  const selected = projectFormatById(selection.resolutionId);
  if (selected?.aspectId === selection.aspectId) return canonicalResolution(selected);
  return canonicalResolution(projectFormatsForAspect(selection.aspectId)[0]);
}

export function selectionForAspect(
  current: ProjectFormatSelection,
  aspectId: ProjectAspectId,
): ProjectFormatSelection {
  if (current.aspectId === aspectId) return current;
  return { ...current, aspectId, resolutionId: projectFormatsForAspect(aspectId)[0].id };
}

export function isProjectFrameRate(value: number): value is (typeof FPS_OPTIONS)[number] {
  return FPS_OPTIONS.some((fps) => fps === value);
}

export function validateProjectFormat(
  resolution: Pick<Resolution, 'width' | 'height'>,
  fps: number,
): string[] {
  const issues: string[] = [];
  if (!projectFormatForResolution(resolution)) {
    issues.push(`Unsupported project resolution ${resolution.width}×${resolution.height}.`);
  }
  if (!isProjectFrameRate(fps)) issues.push(`Unsupported project frame rate ${fps} fps.`);
  return issues;
}

export function formatProjectSummary(
  resolution: Pick<Resolution, 'width' | 'height'>,
  fps: number,
): string {
  const aspect = projectAspectForResolution(resolution);
  return `${aspect?.id ? `${aspect.id} · ` : ''}${resolution.width}×${resolution.height} · ${fps} fps`;
}
