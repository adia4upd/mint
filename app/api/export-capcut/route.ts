import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export const maxDuration = 300;

type Scene = {
  sceneNumber: number;
  script?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  duration?: number;
  kenBurns?: string;
  mediaType?: "video" | "image";
};

const toUs = (sec: number) => Math.round(sec * 1_000_000);
const UUID = () => randomUUID().toUpperCase();

function formatSrtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrt(scenes: Scene[]) {
  let t = 0;
  return scenes
    .map((s, i) => {
      const dur = s.duration || 3;
      const start = t;
      const end = t + dur;
      t = end;
      const text = (s.script || "").trim();
      if (!text) return null;
      return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}\n`;
    })
    .filter(Boolean)
    .join("\n");
}

async function loadLocalAsset(url: string): Promise<Buffer | null> {
  if (!url || !url.startsWith("/assets/")) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", url));
  } catch {
    return null;
  }
}

async function loadAsset(url: string): Promise<Buffer | null> {
  if (!url) return null;
  const local = await loadLocalAsset(url);
  if (local) return local;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const KB_STYLES = ["zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up"] as const;

function makeKF(timeOffset: number, value: number) {
  return {
    curvePoints: [],
    graph_type: 0,
    id: UUID(),
    left_control: { x: 0.0, y: 0.0 },
    right_control: { x: 1.0, y: 1.0 },
    time_offset: timeOffset,
    value: [value],
  };
}

function createKenBurns(durationUs: number, idx: number, override?: string) {
  const style = (override || KB_STYLES[idx % KB_STYLES.length]) as (typeof KB_STYLES)[number];
  if (style === "zoom-in") {
    return [
      {
        id: UUID(),
        keyframe_list: [makeKF(0, 1.0), makeKF(durationUs, 1.12)],
        property_type: "KFTypeUniformScale",
      },
    ];
  }
  if (style === "zoom-out") {
    return [
      {
        id: UUID(),
        keyframe_list: [makeKF(0, 1.12), makeKF(durationUs, 1.0)],
        property_type: "KFTypeUniformScale",
      },
    ];
  }
  if (style === "pan-left") {
    return [
      {
        id: UUID(),
        keyframe_list: [makeKF(0, 1.08), makeKF(durationUs, 1.08)],
        property_type: "KFTypeUniformScale",
      },
      {
        id: UUID(),
        keyframe_list: [makeKF(0, 0.0), makeKF(durationUs, -0.06)],
        property_type: "KFTypePositionX",
      },
    ];
  }
  if (style === "pan-right") {
    return [
      {
        id: UUID(),
        keyframe_list: [makeKF(0, 1.08), makeKF(durationUs, 1.08)],
        property_type: "KFTypeUniformScale",
      },
      {
        id: UUID(),
        keyframe_list: [makeKF(0, 0.0), makeKF(durationUs, 0.06)],
        property_type: "KFTypePositionX",
      },
    ];
  }
  return [];
}

function videoMaterial(id: string, opts: {
  duration: number;
  path: string;
  type: "video" | "photo";
  name: string;
  width?: number;
  height?: number;
}) {
  return {
    aigc_type: "none",
    audio_fade: null,
    category_id: "",
    category_name: "local",
    check_flag: 62978047,
    crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
    crop_ratio: "free",
    crop_scale: 1.0,
    duration: opts.duration,
    extra_type_option: 0,
    has_audio: opts.type === "video",
    has_sound_separated: false,
    height: opts.height || 1080,
    id,
    intensifies_audio_path: "",
    intensifies_path: "",
    is_ai_generate_content: false,
    is_copyright: false,
    local_id: "",
    local_material_id: UUID().toLowerCase(),
    material_id: "",
    material_name: opts.name,
    material_url: "",
    matting: { custom_matting_id: "", enable_matting_stroke: false, expansion: 0, feather: 0, flag: 0, has_use_quick_brush: false, has_use_quick_eraser: false, interactiveTime: [], path: "", reverse: false, strokes: [] },
    media_path: "",
    object_locked: null,
    origin_material_id: "",
    path: opts.path,
    picture_from: "none",
    request_id: "",
    reverse_intensifies_path: "",
    reverse_path: "",
    smart_match_info: null,
    source: 0,
    source_platform: 0,
    stable: { matrix_path: "", stable_level: 0, time_range: { duration: 0, start: 0 } },
    surface_trackings: [],
    team_id: "",
    type: opts.type,
    unique_id: "",
    video_algorithm: { ai_background_configs: [], algorithms: [], complement_frame_config: null, deflicker: null, gameplay_configs: [], motion_blur_config: null, mouth_shape_driver: null, noise_reduction: null, path: "", quality_enhance: null, skip_algorithm_index: [], smart_complement_frame: null, super_resolution: null, time_range: null },
    video_mask_shadow: { alpha: 0, angle: 0, blur: 0, color: "", distance: 0, path: "", resource_id: "" },
    video_mask_stroke: { alpha: 0, color: "", distance: 0, horizontal_shift: 0, path: "", resource_id: "", size: 0, texture: 0, type: "", vertical_shift: 0 },
    width: opts.width || 1920,
  };
}

function audioMaterial(id: string, opts: { duration: number; path: string; name: string }) {
  return {
    category_id: "",
    category_name: "local",
    check_flag: 1,
    duration: opts.duration,
    id,
    local_material_id: UUID().toLowerCase(),
    music_id: UUID().toLowerCase(),
    name: opts.name,
    path: opts.path,
    type: "extract_music",
    wave_points: [],
  };
}

function createSpeed(id: string) {
  return { curve_speed: null, id, mode: 0, speed: 1.0, type: "speed" };
}
function createCanvas(id: string) {
  return { album_image: "", blur: 0, color: "", id, image: "", image_id: "", image_name: "", source_platform: 0, team_id: "", type: "canvas_color" };
}
function createSoundChannelMapping(id: string) {
  return { audio_channel_mapping: 0, id, is_config_open: false, type: "none" };
}
function createVocalSeparation(id: string) {
  return { choice: 0, enter_from: "", final_algorithm: "", id, production_path: "", removed_sounds: [], time_range: null, type: "vocal_separation" };
}
function createMaterialAnimation(id: string) {
  return { animations: [], id, multi_language_current: "none", type: "sticker_animation" };
}
function createBeat(id: string) {
  return { ai_beats: { beat_speed_infos: [], beats_path: "", beats_url: "", melody_path: "", melody_percents: [0], melody_url: "" }, enable_ai_beats: false, gear: 404, gear_count: 0, id, mode: 404, type: "beats", user_beats: [], user_delete_ai_beats: null };
}

function videoSegment(id: string, materialId: string, targetStart: number, targetDur: number, extraRefs: string[]) {
  return {
    caption_info: null,
    cartoon: false,
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0, scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 } },
    color_correct_alg_result: "",
    common_keyframes: [] as unknown[],
    desc: "",
    enable_adjust: true,
    enable_color_curves: true,
    enable_color_wheels: true,
    enable_lut: true,
    enable_video_mask: true,
    extra_material_refs: extraRefs,
    group_id: "",
    hdr_settings: { intensity: 1, mode: 1, nits: 1000 },
    id,
    intensifies_audio: false,
    is_loop: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    lyric_keyframes: null,
    material_id: materialId,
    raw_segment_id: "",
    render_index: 0,
    render_timerange: { duration: 0, start: 0 },
    responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: "", vertical_pos_layout: 0 },
    reverse: false,
    source: "segmentsourcenormal",
    source_timerange: { duration: targetDur, start: 0 },
    speed: 1.0,
    state: 0,
    target_timerange: { duration: targetDur, start: targetStart },
    template_id: "",
    template_scene: "default",
    track_attribute: 0,
    track_render_index: 0,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  };
}

function audioSegment(id: string, materialId: string, targetStart: number, targetDur: number, extraRefs: string[]) {
  return {
    caption_info: null,
    cartoon: false,
    clip: null,
    common_keyframes: [],
    desc: "",
    enable_adjust: false,
    enable_color_curves: true,
    enable_color_wheels: true,
    enable_lut: false,
    enable_video_mask: true,
    extra_material_refs: extraRefs,
    group_id: "",
    hdr_settings: null,
    id,
    intensifies_audio: false,
    is_loop: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    lyric_keyframes: null,
    material_id: materialId,
    raw_segment_id: "",
    render_index: 0,
    render_timerange: { duration: 0, start: 0 },
    responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: "", vertical_pos_layout: 0 },
    reverse: false,
    source: "segmentsourcenormal",
    source_timerange: { duration: targetDur, start: 0 },
    speed: 1.0,
    state: 0,
    target_timerange: { duration: targetDur, start: targetStart },
    template_id: "",
    template_scene: "default",
    track_attribute: 0,
    track_render_index: 2,
    uniform_scale: null,
    visible: true,
    volume: 1.0,
  };
}

function buildCapcutDraft(scenes: Scene[], projectName: string, ratio: string) {
  const isPortrait = ratio === "9:16";
  const W = isPortrait ? 1080 : 1920;
  const H = isPortrait ? 1920 : 1080;

  const folderPath = "__CAPCUT_PROJECT__";
  const mediaBase = `${folderPath}/media`;
  const timelineId = UUID();
  const draftId = UUID();
  const nowUs = Date.now() * 1000;

  const videoMaterials: ReturnType<typeof videoMaterial>[] = [];
  const audioMaterials: ReturnType<typeof audioMaterial>[] = [];
  const speeds: ReturnType<typeof createSpeed>[] = [];
  const canvases: ReturnType<typeof createCanvas>[] = [];
  const soundChannelMappings: ReturnType<typeof createSoundChannelMapping>[] = [];
  const vocalSeparations: ReturnType<typeof createVocalSeparation>[] = [];
  const materialAnimations: ReturnType<typeof createMaterialAnimation>[] = [];
  const beats: ReturnType<typeof createBeat>[] = [];
  const videoSegments: ReturnType<typeof videoSegment>[] = [];
  const audioSegments: ReturnType<typeof audioSegment>[] = [];

  let currentUs = 0;

  scenes.forEach((scene, idx) => {
    const durSec = scene.duration || 3;
    const durUs = toUs(durSec);
    const startUs = currentUs;

    const isVideo = !!scene.videoUrl;
    const fileName = isVideo ? `video_${idx}.mp4` : `image_${idx}.jpg`;
    const mediaPath = `${mediaBase}/${fileName}`;

    const vMatId = UUID();
    const vSpeedId = UUID();
    const vCanvasId = UUID();
    const vSoundChId = UUID();
    const vAnimId = UUID();
    const vVocalSepId = UUID();

    videoMaterials.push(
      videoMaterial(vMatId, {
        duration: durUs,
        path: mediaPath,
        type: isVideo ? "video" : "photo",
        name: fileName,
        width: W,
        height: H,
      }),
    );
    speeds.push(createSpeed(vSpeedId));
    canvases.push(createCanvas(vCanvasId));
    soundChannelMappings.push(createSoundChannelMapping(vSoundChId));
    materialAnimations.push(createMaterialAnimation(vAnimId));
    vocalSeparations.push(createVocalSeparation(vVocalSepId));

    const vSeg = videoSegment(UUID(), vMatId, startUs, durUs, [
      vSpeedId,
      vAnimId,
      vCanvasId,
      vSoundChId,
      vAnimId,
      vVocalSepId,
    ]);
    if (!isVideo) {
      vSeg.common_keyframes = createKenBurns(durUs, idx, scene.kenBurns);
    }
    videoSegments.push(vSeg);

    if (scene.audioUrl) {
      const aMatId = UUID();
      const aSpeedId = UUID();
      const aSoundChId = UUID();
      const aBeatId = UUID();
      const aVocalSepId = UUID();
      audioMaterials.push(
        audioMaterial(aMatId, {
          duration: durUs,
          path: `${mediaBase}/narration_${idx}.mp3`,
          name: `narration_${idx}.mp3`,
        }),
      );
      speeds.push(createSpeed(aSpeedId));
      soundChannelMappings.push(createSoundChannelMapping(aSoundChId));
      beats.push(createBeat(aBeatId));
      vocalSeparations.push(createVocalSeparation(aVocalSepId));
      audioSegments.push(
        audioSegment(UUID(), aMatId, startUs, durUs, [
          aSpeedId,
          aSoundChId,
          aBeatId,
          aVocalSepId,
          aVocalSepId,
        ]),
      );
    }

    currentUs += durUs;
  });

  const totalDurUs = currentUs;

  const draftInfo = {
    canvas_config: { background: null, height: H, ratio: "original", width: W },
    color_space: -1,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: "",
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: "none",
      multi_language_list: [],
      multi_language_main: "none",
      multi_language_mode: "none",
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_recognition_id: "",
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      use_float_render: false,
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    draft_type: "video",
    duration: totalDurUs,
    extra_info: null,
    fps: 30.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: timelineId,
    is_drop_frame_timecode: false,
    keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    last_modified_platform: { app_id: 359289, app_source: "cc", app_version: "8.3.0", device_id: "", hard_disk_id: "", mac_address: "", os: "mac", os_version: "" },
    lyrics_effects: [],
    materials: {
      ai_translates: [],
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audio_pannings: [],
      audio_pitch_shifts: [],
      audio_track_indexes: [],
      audios: audioMaterials,
      beats,
      canvases,
      chromas: [],
      color_curves: [],
      common_mask: [],
      digital_humans: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      images: [],
      log_color_wheels: [],
      loudnesses: [],
      manual_beautys: [],
      manual_deformations: [],
      material_animations: materialAnimations,
      material_colors: [],
      multi_language_refs: [],
      placeholder_infos: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      smart_relights: [],
      sound_channel_mappings: soundChannelMappings,
      speeds,
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      texts: [],
      time_marks: [],
      transitions: [],
      video_effects: [],
      video_radius: [],
      video_shadows: [],
      video_strokes: [],
      video_trackings: [],
      videos: videoMaterials,
      vocal_beautifys: [],
      vocal_separations: vocalSeparations,
    },
    mutable_config: null,
    name: "",
    new_version: "163.0.0",
    path: "",
    platform: { app_id: 359289, app_source: "cc", app_version: "8.3.0", device_id: "", hard_disk_id: "", mac_address: "", os: "mac", os_version: "" },
    relationships: [],
    render_index_track_mode_on: true,
    retouch_cover: null,
    source: "default",
    static_cover_image_path: "",
    time_marks: null,
    tracks: [
      { attribute: 0, flag: 0, id: UUID(), is_default_name: true, name: "", segments: videoSegments, type: "video" },
      { attribute: 0, flag: 0, id: UUID(), is_default_name: true, name: "나레이션", segments: audioSegments, type: "audio" },
    ],
    update_time: 0,
    version: 360000,
  };

  const draftMetaInfo = {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    draft_cover: "draft_cover.jpg",
    draft_deeplink_url: "",
    draft_fold_path: folderPath,
    draft_id: draftId,
    draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false,
    draft_is_from_deeplink: "false",
    draft_is_invisible: false,
    draft_is_web_article_video: false,
    draft_materials: [
      { type: 0, value: [] },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: projectName,
    draft_need_rename_folder: false,
    draft_root_path: folderPath.replace(/\/[^/]+$/, ""),
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0,
    draft_type: "",
    tm_draft_cloud_modified: nowUs,
    tm_draft_create: nowUs,
    tm_draft_modified: nowUs,
    tm_draft_removed: 0,
    tm_duration: totalDurUs,
  };

  return { draftInfo, draftMetaInfo };
}

export async function POST(req: Request) {
  try {
    const body: { scenes?: Scene[]; projectName?: string; ratio?: string } = await req.json();
    const scenes = body.scenes || [];
    if (scenes.length === 0) {
      return Response.json({ error: "씬 데이터가 필요합니다." }, { status: 400 });
    }
    const projectName = body.projectName || `Mint_${Date.now()}`;
    const ratio = body.ratio || "16:9";

    const { draftInfo, draftMetaInfo } = buildCapcutDraft(scenes, projectName, ratio);
    const zip = new JSZip();
    zip.file("draft_info.json", JSON.stringify(draftInfo, null, 2));
    zip.file("draft_meta_info.json", JSON.stringify(draftMetaInfo, null, 2));
    zip.file("subtitles.srt", buildSrt(scenes));

    const mediaFolder = zip.folder("media");
    if (mediaFolder) {
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        const mediaUrl = s.videoUrl || s.imageUrl;
        if (mediaUrl) {
          const buf = await loadAsset(mediaUrl);
          if (buf) {
            const ext = s.videoUrl ? "mp4" : "jpg";
            const name = s.videoUrl ? `video_${i}.${ext}` : `image_${i}.${ext}`;
            mediaFolder.file(name, buf);
          }
        }
        if (s.audioUrl) {
          const buf = await loadAsset(s.audioUrl);
          if (buf) mediaFolder.file(`narration_${i}.mp3`, buf);
        }
      }
    }

    const readme = [
      `${projectName}`,
      ``,
      `사용 방법 (Mac):`,
      `1. 이 ZIP을 풀어서 폴더 전체를 다음 경로로 이동`,
      `   ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/`,
      `2. 폴더 안의 draft_meta_info.json 의 draft_fold_path 를 실제 경로로 수정`,
      `3. CapCut을 켜면 새 프로젝트가 자동으로 표시됩니다.`,
      ``,
      `Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\`,
    ].join("\n");
    zip.file("README.txt", readme);

    const blob = await zip.generateAsync({ type: "nodebuffer" });
    return new Response(new Uint8Array(blob), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(projectName)}.zip"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "내보내기 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
