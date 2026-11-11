/**
 * Sound Engine for Agent Plaza
 * Manages retro Hi-Bit sound effects with master mute/unmute control,
 * volume normalization, throttling, and localStorage persistence.
 */

export type SoundName =
  | 'ui-click'
  | 'ui-spawn'
  | 'ui-switch-theme'
  | 'agent-work'
  | 'agent-complete'
  | 'work-office'
  | 'work-cowboys'
  | 'work-medieval'
  | 'work-japanese'
  | 'work-ww2'
  | 'work-cyberpunk'
  | 'pet-cat'
  | 'pet-dog'
  | 'pet-robot'
  | 'toast-notification';

interface SoundDef {
  file: string;
  volume: number;
  throttleMs?: number;
}

const SOUND_DEFS: Record<SoundName, SoundDef> = {
  'ui-click': { file: '/sfx/ui-click.mp3', volume: 0.35, throttleMs: 60 },
  'ui-spawn': { file: '/sfx/ui-spawn.mp3', volume: 0.5, throttleMs: 200 },
  'ui-switch-theme': { file: '/sfx/ui-switch-theme.mp3', volume: 0.45, throttleMs: 300 },
  'agent-work': { file: '/sfx/agent-work.mp3', volume: 0.32, throttleMs: 350 },
  'agent-complete': { file: '/sfx/agent-complete.mp3', volume: 0.4, throttleMs: 400 },
  'work-office': { file: '/sfx/work-office.mp3', volume: 0.32, throttleMs: 350 },
  'work-cowboys': { file: '/sfx/work-cowboys.mp3', volume: 0.35, throttleMs: 350 },
  'work-medieval': { file: '/sfx/work-medieval.mp3', volume: 0.35, throttleMs: 350 },
  'work-japanese': { file: '/sfx/work-japanese.mp3', volume: 0.35, throttleMs: 350 },
  'work-ww2': { file: '/sfx/work-ww2.mp3', volume: 0.35, throttleMs: 350 },
  'work-cyberpunk': { file: '/sfx/work-cyberpunk.mp3', volume: 0.32, throttleMs: 350 },
  'pet-cat': { file: '/sfx/pet-cat.mp3', volume: 0.45, throttleMs: 250 },
  'pet-dog': { file: '/sfx/pet-dog.mp3', volume: 0.45, throttleMs: 250 },
  'pet-robot': { file: '/sfx/pet-robot.mp3', volume: 0.45, throttleMs: 250 },
  'toast-notification': { file: '/sfx/toast-notification.mp3', volume: 0.35, throttleMs: 300 },
};

class SoundEngine {
  private enabled: boolean = false;
  private audioCache = new Map<SoundName, HTMLAudioElement>();
  private lastPlayed = new Map<SoundName, number>();
  private listeners = new Set<(enabled: boolean) => void>();

  constructor() {
    // Read saved preference from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agent-plaza-sound-enabled');
      // Default to false (muted) to respect browser autoplay policy until user opts in
      this.enabled = saved === 'true';
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof window !== 'undefined') {
      localStorage.setItem('agent-plaza-sound-enabled', val ? 'true' : 'false');
    }
    // Pre-warm audio cache on first enable
    if (val) {
      this.preWarm();
    }
    this.notify();
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    if (this.enabled) {
      this.play('ui-click');
    }
    return this.enabled;
  }

  public subscribe(cb: (enabled: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const cb of this.listeners) {
      cb(this.enabled);
    }
  }

  private preWarm() {
    if (typeof window === 'undefined') return;
    for (const [name, def] of Object.entries(SOUND_DEFS) as [SoundName, SoundDef][]) {
      if (!this.audioCache.has(name)) {
        try {
          const a = new Audio(def.file);
          a.volume = def.volume;
          a.preload = 'auto';
          this.audioCache.set(name, a);
        } catch {
          // ignore pre-warm errors
        }
      }
    }
  }

  public play(name: SoundName) {
    if (!this.enabled || typeof window === 'undefined') return;

    const def = SOUND_DEFS[name];
    if (!def) return;

    // Check throttle
    const now = performance.now();
    const last = this.lastPlayed.get(name) || 0;
    if (def.throttleMs && now - last < def.throttleMs) {
      return;
    }
    this.lastPlayed.set(name, now);

    try {
      let audio = this.audioCache.get(name);
      if (!audio) {
        audio = new Audio(def.file);
        audio.volume = def.volume;
        this.audioCache.set(name, audio);
      }

      // If already playing, clone for polyphonic overlap
      if (!audio.paused && audio.currentTime > 0) {
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = def.volume;
        clone.play().catch(() => {});
      } else {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    } catch {
      // Audio playback blocked or unavailable
    }
  }

  /**
   * Resolves the contextual work sound for a given template ID
   */
  public getWorkSoundForTemplate(templateId?: string): SoundName {
    switch (templateId?.toLowerCase()) {
      case 'office':
        return 'work-office';
      case 'cowboys':
        return 'work-cowboys';
      case 'medieval':
        return 'work-medieval';
      case 'japanese':
        return 'work-japanese';
      case 'ww2':
        return 'work-ww2';
      case 'cyberpunk':
        return 'work-cyberpunk';
      default:
        return 'work-office';
    }
  }

  /**
   * Plays the contextual work sound corresponding to the active scene template
   */
  public playWorkSound(templateId?: string) {
    const sfx = this.getWorkSoundForTemplate(templateId);
    this.play(sfx);
  }
}

export const soundEngine = new SoundEngine();
