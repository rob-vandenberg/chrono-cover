/**
 * chrono-cover
 *
 * Self-contained (no imports, no external dependencies) custom element for
 * controlling a single cover-domain entity via a vertical slider or
 * directional buttons, with configurable favorite positions.
 *
 * This is NOT a Lovelace dashboard card - it has no visual editor and is
 * not intended for direct placement in a dashboard grid. It is a resource
 * meant to be invoked as a popup, triggered by a tap_action elsewhere on
 * the dashboard, as a stand-in for HA's native more-info dialog for
 * covers. It can be triggered two ways:
 *  - Its own built-in fire-dom-event listener (see "Self-fired popup"
 *    below) - no other resource required.
 *  - Any other popup mechanism (e.g. browser_mod's browser_mod.popup
 *    service) pointing its content: at type: custom:chrono-cover.
 *
 * Visual design and behavior are ported from chrono-slider-card, rebuilt
 * on vertical-cover-slider-card's architecture: a plain HTMLElement with a
 * manually-built shadow DOM, patched imperatively (no reactive framework).
 *
 * Behavior preset (device_open_state / device_open_percentage /
 * device_open_slider) is resolved automatically from the entity's own
 * device_class attribute (the "Show as" field in HA's entity settings
 * dialog) - no per-instance device_type configuration required, unless
 * explicitly overridden in config.
 *
 * Self-fired popup:
 *   tap_action:
 *     action: fire-dom-event
 *     chrono-cover:
 *       data:
 *         title: Zijraam
 *         entity: cover.woonkamer_zijraam
 *         device_type: awning
 *         favorite_positions: [0, 25, 75, 100]
 *         ...any other chrono-cover config option
 *   Same calling convention as chrono-popup's chrono-popup: key - fire a
 *   native fire-dom-event action, namespaced under this resource's own
 *   key so multiple such resources coexist without colliding. "title"
 *   drives the popup header; every other key in "data" is passed straight
 *   through as this element's own config, unchanged.
 */

// --- Version ------------------------------------------------------------
const CARD_VERSION = '1.3.30';

// --- Version History ----------------------------------------------------
// v1.3.30: Popup shadow-root collapse. <chrono-cover-popup-host> is gone -
//           <chrono-cover> now builds its own popup chrome (overlay/frame/
//           header/heading/close-button/body) directly inside its own
//           existing shadow root via two new methods, openAsPopup() and
//           close(), instead of a second custom element with a second
//           shadow root. There is no longer a permanent, app-wide singleton
//           host element living in document.body - the ll-custom listener
//           now creates a fresh <chrono-cover> per popup open and removes
//           it entirely on close, matching what was already true of the
//           popup's inner content before this version (already rebuilt/
//           discarded every open, just previously wrapped by a persistent
//           outer shell). subscribeEvents live-update wiring and Escape-key
//           dismissal moved from the old host onto ChronoCover itself,
//           scoped per-instance rather than per-singleton.
//           BREAKING CONFIG CHANGE: the "popup" skip-key in styles: is
//           removed - it existed only to route styles.popup to a second,
//           separate shadow root, which no longer exists. Popup-chrome
//           classnames (frame, header, heading, close-button, overlay,
//           body) are now reached directly at the top level of styles:,
//           the same as every other classname - "styles: popup: { frame:
//           ... } }" must become "styles: { frame: ... } }".
// v1.2.23: Classname audit fix, in preparation for the (not-yet-started)
//           popup shadow-root collapse. Every previously unclassed <svg>
//           icon (open, stop, close, position-mode toggle, button-mode
//           toggle, and the popup dialog's close button) now has its own
//           unique classname, matching the existing convention already
//           used for their <path> children (stop/position-mode/button-mode
//           <path>s also gained matching classes; open-icon-path and
//           close-icon-path were already present, unchanged). The popup
//           dialog's own header title span is renamed .title -> .heading:
//           <chrono-cover>'s own inner .title element already uses that
//           exact name, and while today the two live in separate shadow
//           roots (harmless), a collapsed single shadow root would make
//           them collide. Purely additive/renaming - no layout, styling,
//           or behavioral changes.
// v1.2.22: styles: is no longer a flat, one-level-only map. Nested plain
//           objects now produce CSS descendant selectors (space-separated,
//           any depth) - e.g. styles: { slider: { handle: { color: red } } }
//           now produces ".slider .handle { color: red; }". "host" -> ":host"
//           and the "popup" skip-key both still only apply at the top level;
//           deeper than that they're literal (if unlikely) classname
//           segments. Every classname at every level always emits its own
//           rule, even with zero direct declarations (e.g. .slider {  }
//           alongside .slider .handle {...} in the example above) - an
//           empty block is still valid CSS and may be a deliberate,
//           temporary no-op while testing. ccBuildUserStylesCss() is now a
//           thin wrapper around a new recursive helper,
//           ccBuildUserStylesRules(); both existing call sites
//           (ChronoCover.setConfig(), ChronoCoverPopupHost.open()) are
//           unchanged.
// v1.2.21: .slider-track's border-radius now uses inherit instead of
//           var(--slider-border-radius) directly. .slider-track is the
//           element that's actually visible (it clips the rounded shape),
//           but .slider is the box a person overrides via styles: - a
//           plain border-radius: 8px on .slider (as opposed to the
//           --slider-border-radius custom property, which does cascade
//           normally) never reached .slider-track, since regular CSS
//           properties don't inherit by default. border-radius: inherit
//           picks up .slider's own computed value however it was set -
//           default, the variable, or a direct literal override - so both
//           forms now work identically. Same "outer box is the boss"
//           principle as v1.2.20's width fix, applied to border-radius.
// v1.2.20: Slider restructured so .slider is the single outer, authoritative
//           box - styles: slider: { width: ... } (or min-width/max-width/
//           height) now works directly, matching what anyone would guess
//           first. .control-slider-host and .slider-container are both
//           gone - .slider itself now carries their combined width/height/
//           visibility-toggle/--handle-* responsibilities. This required
//           moving .slider's own overflow:hidden (needed to clip the
//           rounded track corners) down onto a new inner .slider-track
//           wrapper, since .slider itself needed to become unclipped -
//           .tooltip escapes visually to its left, and .slider-track-bar's
//           own vertical translate deliberately overhangs .slider's own
//           top edge at partial values, both of which .slider's old
//           overflow:hidden was doing double duty clipping/hosting. Nobody
//           targets .slider-track directly via styles: - it exists purely
//           to keep the rounded-corner clip working, one level below the
//           box people actually reach for. DOM, CSS, and every JS element
//           reference (_sliderHostEl/_sliderContainerEl merged into the
//           existing _sliderEl) updated together - no functional/visual
//           behavior change intended, purely a structural simplification.
//           Not yet visually confirmed by the user - flag until then.
// v1.1.12: Popup header title now falls back to the entity's own
//           friendly_name (then the entity id itself, as a last resort)
//           when no explicit title is given in data:. Mirrors the
//           fallback priority ChronoCover's own inner title already had
//           (config.name || entity.attributes.friendly_name ||
//           this._config.entity) - added here because the popup's own
//           default show_name: false hides that inner title in this
//           context, so the popup header previously had no fallback of
//           its own and rendered blank. Looked up once per open() call via
//           the already-fetched hass object - no change to ChronoCover's
//           own title logic.
// v1.1.11: Changed two defaults. DEFAULT_SHOW_LAST_CHANGED: true -> false
//           (the relative-time label is now hidden by default). ha-card's
//           own default styling now includes border: none (flat property,
//           no new CSS variable - matches the change as requested, not
//           var-ified like most other properties in _css(), since that
//           wasn't asked for). Both remain fully overridable via
//           show_last_changed: true / styles: ha_card: { border: ... }
//           respectively, same mechanism as every other default.
//           show_percentage was already true by default (DEFAULT_SHOW_
//           PERCENTAGE, unchanged since v1.0.0) - no change needed there.
// v1.1.10: Fixed DEVICE_TYPE_DEFAULTS auto-detection for shade entities.
//           The tuned open_state/percentage/slider values ported from
//           chrono-slider-card's "Screen" device_type had been filed under
//           the key "screen" - not a real Home Assistant cover
//           device_class (verified: awning, blind, curtain, damper, door,
//           garage, gate, shade, shutter, window are the real values,
//           "screen" is not one of them). Since chrono-cover looks up this
//           table by the entity's own device_class for auto-detection,
//           entities with device_class: shade were falling through to the
//           untuned "cover" defaults instead. Fix: the tuned values now
//           live under "shade" (2nd entry, right after "cover"), which
//           auto-detection actually matches. "screen" is kept as its own
//           entry (11th, before "window") with the same tuned values, for
//           anyone using device_type: screen as a manual override for
//           parity with chrono-slider-card's own naming - it can only ever
//           be reached that way, never by auto-detection, since no real HA
//           entity has that device_class.
// v1.0.9: Fixed ccNormalizeFavoritePositions() to actually accept
//          favorite_positions as a comma-separated string (e.g.
//          "0, 25, 75, 100"), and added the {value:label} custom-label
//          syntax (e.g. "{0:Close}") - both ported from
//          chrono-slider-card's cscNormalizeFavoritePositions(). Previously
//          any non-array input (including the documented plain string
//          form) was treated as a single token, so Number() on a
//          comma-containing string returned NaN and the entire favorites
//          row silently rendered empty - a bug introduced in v1.0.0 and
//          never caught until now. A bare non-array, non-string value
//          (e.g. a lone number) is still wrapped into a one-item list
//          first, same graceful handling as before. The
//          already-normalized-object-token branch chrono-slider-card also
//          has (for its own live editor passing objects back) is
//          intentionally left out - chrono-cover has no editor and nothing
//          in this codebase ever produces that shape.
// v1.0.8: Added close_align ('left' default | 'right' | 'hidden') and
//          title_align ('left' default | 'right' | 'center' | 'hidden')
//          config options, read by the popup host in open(). Close button
//          side is set via the CSS order property on the existing flex
//          .header row (title already has flex: 1, so it always claims
//          the full remaining width - never a reserved/symmetric track -
//          meaning no gap is ever left on the side opposite the button,
//          regardless of which combination of alignments is chosen).
//          Invalid values fall back to 'left' with a console.warn.
//          Explicitly reset on every open() call, not just when a
//          non-default value is given, since the popup host is a
//          singleton reused across every popup invocation - otherwise a
//          previous popup's right/hidden setting would leak into the next
//          one that didn't specify it. Snake_case only for now (matching
//          every other existing option); kebab-case dual-notation
//          acceptance deliberately deferred, not attempted here. Existing
//          click-outside-backdrop and Escape-key dismissal (both already
//          unconditional, unchanged) verified sufficient for the
//          close_align: hidden case - no one can be stranded without a
//          visible close button.
// v1.0.7: Pixel-aligned the state text, slider, and mode-toggle buttons
//          against native HA's more-info dialog (measured directly by the
//          user, overlaying both dialogs' close buttons as a shared
//          origin point). state font-size default raised from 32px to
//          36px, matching native's measured value. .state's own padding
//          redistributed asymmetrically (top 4px->9px, bottom 4px->1px,
//          both split from the same total split point rather than kept
//          symmetric) so the state text shifts down by 5px while the net
//          push onto .last-changed is only +2px, both effects produced by
//          .state's own box alone - no properties on .last-changed
//          touched, and no negative margins used anywhere, per rule
//          against solving cascade side-effects with a downstream
//          negative-margin patch rather than fixing them at their actual
//          source. .control-slider-host given margin-top: 5px (previously
//          unset, defaulted to 0 from .main-control > *'s shorthand).
//          controls-gap default (drives .icon-button-group's existing
//          margin-top) raised from 20px to 24px, the remaining +4px.
//          .favorites required no changes - lands correctly once the
//          above cascade through normal flow.
// v1.0.6: Fixed favorite-position buttons wrapping to a second row.
//          Root cause verified against native HA's own more-info dialog
//          (div.groups, the native equivalent element): native has no
//          independent width cap at all - it simply fills whatever content
//          width its dialog gives it (confirmed identical across four
//          viewport-width samples: dialog width minus groups width was
//          exactly 48px, i.e. div.content's 24px padding, in every case).
//          chrono-cover's .favorites, by contrast, had its own hardcoded
//          max-width: 384px, unrelated to its actual container - the fix
//          removes that cap (max-width default changed from 384px to
//          none) so it fills ha-card's actual width instead, same
//          mechanism as native, not a copied pixel value from any one
//          native measurement. Also added a 450px viewport-width
//          breakpoint to the popup host's .frame/.overlay, matching
//          native's own reported behavior of dropping its floating-card
//          chrome for an edge-to-edge full-screen surface below that
//          width - width/mechanism only, not height, since only width was
//          verified in this session.
// v1.0.5: Popup dialog chrome brought in line with native HA more-info
//          dialog measurements (chrome only - the slider control itself is
//          unchanged and out of scope for this comparison). .frame default
//          max-width raised from 420px to 580px (matches native's fixed
//          580px dialog width, also resolves favorites wrapping to 2 rows
//          instead of 1). .frame default border-radius lowered from 28px
//          to 24px (matches native exactly). Popup host's open() now
//          injects show_name: false into the config handed to
//          ChronoCover.setConfig() unless the caller's own data: already
//          sets show_name explicitly - removes the duplicate title (popup
//          header already shows it; ChronoCover's own .title became
//          redundant only in this context, so the change is scoped to the
//          popup host, not a global default). .header restructured from a
//          single title span with an absolutely-positioned close button
//          into a flex row - close button first (left), title second -
//          replacing the absolute positioning so the two can never
//          overlap regardless of title length. Close button remains
//          left-only and title remains left-aligned-following; the
//          previously-discussed configurable close-button-side/title-
//          alignment mechanism (planned to be ported from chrono-popup,
//          which already solves this generally) is explicitly deferred,
//          not attempted here.
// v1.0.4: Added the styles: config option, ported from chrono-slider-card -
//          a flat { class_name: { property: value } } block converted to
//          CSS and adopted as a stylesheet, so overrides reliably win
//          against this element's own defaults. "host" reaches this
//          element's own root; every other key reaches a real class name
//          already present in the markup (e.g. "ha_card"). The entity's
//          live state color, previously set as an inline style, now goes
//          through its own adopted stylesheet instead, since an inline
//          style can never lose to any stylesheet - it would have made
//          the color impossible to override. One reserved key inside
//          styles:, "popup", is a nested object read by the popup host
//          separately and built into its own stylesheet, adopted into its
//          own shadow root - the popup window and the <chrono-cover>
//          element inside it are separate shadow trees, so each needs its
//          own stylesheet; "popup" only has any effect when the built-in
//          popup trigger is used, not with browser_mod. Default for
//          show_control_switch_buttons changed from false to true.
// v1.0.3: Removed ':host { all: initial; }' from the popup host's CSS -
//          it was blocking inheritance of every HA theme color and the
//          font, not just the font (the only visible symptom). Wrapped
//          the popup host's setConfig() call in try/catch so a bad
//          tap_action (e.g. missing entity) shows a visible error in the
//          popup instead of failing silently.
// v1.0.2: Fixed leftover CHRONO_COVER_VERSION reference in the console
//          banner (from before the constant was renamed to CARD_VERSION),
//          which threw a ReferenceError on load and broke the module.
// v1.0.1: Added a built-in self-fired popup, triggered via a native
//          fire-dom-event tap_action namespaced under a "chrono-cover"
//          key (same calling convention as chrono-popup). No external
//          dependency: live entity updates while the popup is open use
//          hass.connection.subscribeEvents('state_changed') directly,
//          not the home-assistant-js-websocket package chrono-popup
//          imports from CDN - that connection object already exposes the
//          same method, since HA's own frontend runtime is already built
//          on that library.
// v1.0.0: Initial release.

// --- CONSTS ---------------------------------------------------------------

// ---- MDI icon paths ----
const ICON_MENU = 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z';
const ICON_SWAP_VERTICAL = 'M9,3L5,7H8V14H10V7H13M16,17V10H14V17H11L15,21L19,17H16Z';
const ICON_ARROW_UP = 'M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z';
const ICON_ARROW_DOWN = 'M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z';
const ICON_ARROW_EXPAND_HORIZONTAL = 'M9,11H15V8L19,12L15,16V13H9V16L5,12L9,8V11Z';
const ICON_ARROW_COLLAPSE_HORIZONTAL =
  'M13,20H11V14H5V16L1,12L5,8V10H11V4H13V10H19V8L23,12L19,16V14H13V20Z';
const ICON_STOP = 'M18,18H6V6H18V18Z';

// ---- General constants ----
const UNAVAILABLE = 'unavailable';
const RELATIVE_TIME_REFRESH_INTERVAL_MS = 30000;
const OPEN_CLOSE_THRESHOLD = 10;

// Must match .slider's own --handle-size in the CSS below.
const HANDLE_SIZE_PX = 4;
// Divisor used to derive the slider's handle margin from its width - must
// match the divisor in .slider's own --handle-margin CSS formula.
const HANDLE_MARGIN_DIVISOR = 8;

// Device-type preset table, keyed by the entity's device_class attribute
// (HA's "Show as" field). Each of the 3 device-behavior booleans is
// defined relative to the device being fully retracted (raw HA
// current_position === 100), same convention as chrono-slider-card.
// "cover" is the fallback used when device_class is unset, unrecognized,
// or when an explicit device_type override in config doesn't match a
// known key - it always represents the combination that mirrors HA's own
// native slider (raw current_position used as-is, no inversion).
// "shade" and "awning" carry the exact values chrono-slider-card already
// defined for its own "Screen" and "Awning" device types. "screen" is not
// a real HA cover device_class (verified real values: awning, blind,
// curtain, damper, door, garage, gate, shade, shutter, window) so it's
// kept here only as a manual device_type override for anyone typing it by
// hand, same tuned values as "shade" - auto-detection can never reach it
// since no real entity has that device_class. The remaining 7 entries are
// real HA cover device_class values not yet individually tuned - each is
// set equal to "cover" as a deliberate placeholder, not a verified
// behavioral choice.
const DEVICE_TYPE_DEFAULTS = {
  cover: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  shade: {
    device_open_state: true,
    device_open_percentage: false,
    device_open_slider: false,
  },
  awning: {
    device_open_state: false,
    device_open_percentage: false,
    device_open_slider: false,
  },
  blind: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  curtain: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  damper: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  door: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  garage: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  gate: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  shutter: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
  screen: {
    device_open_state: true,
    device_open_percentage: false,
    device_open_slider: false,
  },
  window: {
    device_open_state: true,
    device_open_percentage: true,
    device_open_slider: true,
  },
};

// Standalone config defaults, independent of device_type/device_class.
const DEFAULT_SHOW_NAME = true;
const DEFAULT_SHOW_STATE = true;
const DEFAULT_SHOW_LAST_CHANGED = false;
const DEFAULT_SHOW_PERCENTAGE = true;
const DEFAULT_SHOW_CONTROL_SWITCH_BUTTONS = true;
const DEFAULT_SHOW_CONTROLS = true;
const DEFAULT_SHOW_FAVORITES = true;
const DEFAULT_CONTROL = 'slider';
const DEFAULT_FAVORITE_POSITIONS = [0, 25, 75, 100];

// Remembers the user's last-picked slider/buttons toggle across page
// reloads, per entity, per browser - via localStorage. Own key prefix,
// deliberately distinct from chrono-slider-card's, so the same entity
// used in both a dashboard chrono-slider-card and a chrono-cover popup
// doesn't have one silently override the other.
const TOGGLE_MODE_STORAGE_PREFIX = 'chrono-cover-control-';
function ccToggleModeStorageKey(entityId) {
  return `${TOGGLE_MODE_STORAGE_PREFIX}${entityId}`;
}

// --- Console log ---------------------------------------------------------------
console.info(
  `%c CHRONO-%cCOVER%c %c v${CARD_VERSION} `,
  'background-color: #101010; color: #FFFFFF; font-weight: bold; padding: 2px 0 2px 4px; border-radius: 3px 0 0 3px;',
  'background-color: #101010; color: #4676d3; font-weight: bold; padding: 2px 0;',
  'background-color: #101010; color: #FFFFFF; font-weight: bold; padding: 2px 4px 2px 0;',
  'background-color: #1E1E1E; color: #FFFFFF; font-weight: bold; padding: 2px 4px; border-radius: 0 3px 3px 0;'
);

// --- Helper functions (pure, DOM-free) ------------------------------------------

function ccComputeOpenIcon(entity) {
  switch (entity.attributes.device_class) {
    case 'awning':
    case 'door':
    case 'gate':
    case 'curtain':
      return ICON_ARROW_EXPAND_HORIZONTAL;
    default:
      return ICON_ARROW_UP;
  }
}
function ccComputeCloseIcon(entity) {
  switch (entity.attributes.device_class) {
    case 'awning':
    case 'door':
    case 'gate':
    case 'curtain':
      return ICON_ARROW_COLLAPSE_HORIZONTAL;
    default:
      return ICON_ARROW_DOWN;
  }
}

// deviceOpenState: true if raw HA current_position===100 (fully retracted)
// is this device's "open" end - see DEVICE_TYPE_DEFAULTS.
function ccIsOpeningCover(entity, deviceOpenState) {
  return entity.state === (deviceOpenState ? 'opening' : 'closing');
}

function ccCanOpenCover(entity, deviceOpenState) {
  if (entity.state === UNAVAILABLE) return false;
  const assumedState = entity.attributes.assumed_state === true;
  let isFullyOpen;
  if (entity.attributes.current_position !== undefined) {
    isFullyOpen = entity.attributes.current_position === (deviceOpenState ? 100 : 0);
  } else {
    isFullyOpen = entity.state === (deviceOpenState ? 'open' : 'closed');
  }
  return assumedState || (!isFullyOpen && !ccIsOpeningCover(entity, deviceOpenState));
}

function ccIsBelowThreshold(value, threshold) {
  return value < threshold;
}

function ccIsCoverStateClosed(entity, deviceOpenState) {
  if (entity.attributes.current_position !== undefined) {
    const pos = entity.attributes.current_position;
    if (deviceOpenState) return ccIsBelowThreshold(pos, OPEN_CLOSE_THRESHOLD);
    return !ccIsBelowThreshold(pos, 100 - OPEN_CLOSE_THRESHOLD);
  }
  return entity.state === (deviceOpenState ? 'closed' : 'open');
}

function ccStateActiveCover(compareState) {
  if (compareState === 'unavailable' || compareState === 'unknown') return false;
  if (compareState === 'off') return false;
  return compareState !== 'closed';
}

function ccSlugifyState(state) {
  return String(state).toLowerCase();
}

function ccDomainColorPropertiesCover(deviceClass, compareState, active) {
  const properties = [];
  const stateKey = ccSlugifyState(compareState);
  const activeKey = active ? 'active' : 'inactive';
  if (deviceClass) {
    properties.push(`--state-cover-${deviceClass}-${stateKey}-color`);
  }
  properties.push(
    `--state-cover-${stateKey}-color`,
    `--state-cover-${activeKey}-color`,
    `--state-${activeKey}-color`
  );
  return properties;
}

function ccComputeCssVariable(props) {
  return props.reduceRight((str, v) => `var(${v}${str ? `, ${str}` : ''})`, undefined);
}

function ccStateColorCssCover(entityState, deviceClass, forcedState) {
  const compareState = forcedState !== undefined ? forcedState : entityState;
  if (compareState === 'unavailable') return 'var(--state-unavailable-color)';
  const active = ccStateActiveCover(compareState);
  return ccComputeCssVariable(ccDomainColorPropertiesCover(deviceClass, compareState, active));
}

// Favorite positions as an array, a comma-separated string (e.g.
// "0, 25, 75, 100"), or entries using a custom {value:label} syntax (e.g.
// "{0:Close}") - ported from chrono-slider-card's
// cscNormalizeFavoritePositions(). The already-normalized-object-token
// branch that function also has (for its own live editor passing objects
// back) is intentionally left out - chrono-cover has no editor and nothing
// in this codebase ever produces that shape.
function ccNormalizeFavoritePositions(positions) {
  if (!positions) return [];
  let tokens;
  if (typeof positions === 'string') {
    tokens = positions
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  } else if (Array.isArray(positions)) {
    tokens = positions;
  } else {
    tokens = [positions];
  }
  const normalized = [];
  for (const token of tokens) {
    const braced = /^\{(.+):(.+)\}$/.exec(String(token).trim());
    if (braced) {
      const value = Number(braced[1].trim());
      const label = braced[2].trim();
      if (isNaN(value) || label === '') continue;
      const clamped = Math.max(0, Math.min(100, value));
      normalized.push({ value: clamped, label });
      continue;
    }
    const value = Number(token);
    if (isNaN(value)) continue;
    const clamped = Math.max(0, Math.min(100, value));
    normalized.push({ value: clamped, label: `${clamped}%` });
  }
  return normalized;
}

function ccRelativeTimeText(dateString) {
  const then = new Date(dateString).getTime();
  const now = Date.now();
  const diffSeconds = Math.round((now - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const table = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [unit, secondsInUnit] of table) {
    if (Math.abs(diffSeconds) >= secondsInUnit || unit === 'second') {
      const value = Math.round(diffSeconds / secondsInUnit);
      return rtf.format(-value, unit);
    }
  }
  return '';
}

function ccExpandEscapedNewlines(text) {
  return String(text).replace(/\\n/g, '\n');
}

// Converts a snake_case string to kebab-case. YAML already allows hyphens
// directly in key names - this only matters for someone who prefers typing
// styles: keys as snake_case, matching every other config option's style.
function ccToKebab(str) {
  return String(str).replace(/_/g, '-');
}

// Converts a styles: block - nestable to any depth - into ready-to-adopt
// CSS text. Each key at each level is classified by its value: a plain
// object (not an array) is a nested classname, appended as a new descendant-
// selector segment (space-separated, e.g. ".slider .handle") and recursed
// into; a primitive (string/number) is a real CSS declaration on the
// selector path built so far. "host" -> ":host" only applies at the top
// level (empty selectorPath); deeper than that it's a literal, ordinary
// classname segment. Every classname at every level always emits its own
// rule, even with zero direct declarations - an empty block is still valid
// CSS and may be a deliberate, temporary no-op while a person is testing.
// A bare top-level primitive with no wrapping classname (styles: { color:
// red }) is silently ignored, same as the old flat version's behavior.
function ccBuildUserStylesRules(props, selectorPath) {
  const rules = [];
  let declarations = '';
  for (const [key, value] of Object.entries(props)) {
    const isNestedClass = value && typeof value === 'object' && !Array.isArray(value);
    if (isNestedClass) {
      const segment = selectorPath.length === 0 && key === 'host' ? ':host' : `.${ccToKebab(key)}`;
      rules.push(...ccBuildUserStylesRules(value, [...selectorPath, segment]));
    } else if (selectorPath.length > 0) {
      declarations += `${ccToKebab(key)}: ${value}; `;
    }
    // else: bare top-level non-object value with no wrapping classname -
    // silently ignored, matches old behavior.
  }
  if (selectorPath.length > 0) {
    rules.push(`${selectorPath.join(' ')} { ${declarations.trim()} }`);
  }
  return rules;
}

function ccBuildUserStylesCss(stylesConfig) {
  return ccBuildUserStylesRules(stylesConfig, []).join('\n');
}

// --- Custom element --------------------------------------------------------------

class ChronoCover extends HTMLElement {
  constructor() {
    super();
    // Two constructed sheets, adopted in _buildDom() in this fixed order
    // (later = wins ties): _stateStyleSheet first, _userStyleSheet last.
    // _stateStyleSheet carries the entity-state-driven slider color
    // (rewritten in _updateUI() on every hass push) - moved here from a
    // plain inline style, matching the fix chrono-slider-card already made
    // (v1.3.41): an inline style always wins over any stylesheet regardless
    // of adoption order, which would make it impossible for a person's own
    // styles: override to ever win against it. _userStyleSheet holds a
    // person's styles: overrides, adopted last so they always win against
    // both this element's own defaults and the state-driven color.
    this._stateStyleSheet = new CSSStyleSheet();
    this._userStyleSheet = new CSSStyleSheet();
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this._config = config;

    let stylesConfig = config.styles;
    if (stylesConfig !== undefined && (typeof stylesConfig !== 'object' || Array.isArray(stylesConfig))) {
      console.warn('chrono-cover: "styles" must be an object, ignoring.');
      stylesConfig = {};
    }
    // Popup-chrome classnames (frame, header, heading, close-button,
    // overlay, body) now live in this same shadow root and stylesheet -
    // no separate skip-key routing needed since the collapse in v1.3.30.
    this._userStyleSheet.replaceSync(ccBuildUserStylesCss(stylesConfig || {}));

    this._showName = config.show_name !== undefined ? config.show_name === true : DEFAULT_SHOW_NAME;
    this._showState = config.show_state !== undefined ? config.show_state === true : DEFAULT_SHOW_STATE;
    this._showLastChanged =
      config.show_last_changed !== undefined ? config.show_last_changed === true : DEFAULT_SHOW_LAST_CHANGED;
    this._showPercentage =
      config.show_percentage !== undefined ? config.show_percentage === true : DEFAULT_SHOW_PERCENTAGE;
    this._showControlSwitchButtons =
      config.show_control_switch_buttons !== undefined
        ? config.show_control_switch_buttons === true
        : DEFAULT_SHOW_CONTROL_SWITCH_BUTTONS;
    this._showControls =
      config.show_controls !== undefined ? config.show_controls === true : DEFAULT_SHOW_CONTROLS;
    this._showFavorites =
      config.show_favorites !== undefined ? config.show_favorites === true : DEFAULT_SHOW_FAVORITES;
    this._defaultControl =
      config.default_control === 'buttons' || config.default_control === 'slider'
        ? config.default_control
        : DEFAULT_CONTROL;

    this._favoritePositions = ccNormalizeFavoritePositions(
      config.favorite_positions !== undefined ? config.favorite_positions : DEFAULT_FAVORITE_POSITIONS
    );

    // Preset overrides - resolved live against the entity in _resolvePreset(),
    // called from the hass setter, since device_class comes from the entity,
    // not from config.
    this._deviceTypeOverride = config.device_type;
    this._deviceOpenStateOverride = config.device_open_state;
    this._deviceOpenPercentageOverride = config.device_open_percentage;
    this._deviceOpenSliderOverride = config.device_open_slider;
    // Safe defaults until the first hass push resolves the real preset.
    this._deviceOpenState = DEVICE_TYPE_DEFAULTS.cover.device_open_state;
    this._deviceOpenPercentage = DEVICE_TYPE_DEFAULTS.cover.device_open_percentage;
    this._deviceOpenSlider = DEVICE_TYPE_DEFAULTS.cover.device_open_slider;

    this._dragging = false;
    this._dragValue = null;

    let storedControl = null;
    try {
      storedControl = window.localStorage.getItem(ccToggleModeStorageKey(config.entity));
    } catch (e) {
      storedControl = null;
    }
    const effectiveControl =
      storedControl === 'buttons' || storedControl === 'slider' ? storedControl : this._defaultControl;
    this._toggleMode = effectiveControl === 'buttons' ? 'button' : 'position';

    if (!this.shadowRoot) {
      this._buildDom();
    }
    this._buildFavoriteButtons();

    if (!this._relativeTimeInterval) {
      this._relativeTimeInterval = setInterval(() => {
        if (this._entity && !this._dragging) {
          this._relativeTime = ccRelativeTimeText(this._entity.last_changed);
          this._lastChangedEl.textContent = this._relativeTime;
        }
      }, RELATIVE_TIME_REFRESH_INTERVAL_MS);
    }

    if (this._hass) {
      const entity = this._hass.states[this._config.entity];
      if (entity) {
        this._entity = entity;
        this._resolvePreset();
        this._updateUI();
      }
    }
  }

  disconnectedCallback() {
    if (this._relativeTimeInterval) clearInterval(this._relativeTimeInterval);
    this._teardownDragListeners();
  }

  // Builds the popup chrome (overlay/frame/header/heading/close-button/
  // body) directly inside this element's own existing shadow root and
  // appends this element to document.body - collapses what used to be a
  // second custom element with a second shadow root (v1.3.30). Assumes
  // setConfig() was already attempted by the caller; errorMessage is
  // passed in explicitly for the case where setConfig() threw (e.g. a
  // missing entity), since this method can't call setConfig() itself
  // without also duplicating its own try/catch responsibility.
  openAsPopup(title, closeAlign, titleAlign, errorMessage) {
    const hasControl = !!this.shadowRoot;
    if (!hasControl) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.adoptedStyleSheets = [this._stateStyleSheet, this._userStyleSheet];
      this.shadowRoot.innerHTML = `<style>${ChronoCover._css()}</style>`;
    }
    const root = this.shadowRoot;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="frame">
        <div class="header">
          <button class="close-button" aria-label="Close">
            <svg class="dismiss-icon" viewBox="0 0 24 24"><path class="dismiss-icon-path" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
          <span class="heading"></span>
        </div>
        <div class="body"></div>
      </div>
    `;
    const bodyEl = overlay.querySelector('.body');
    if (hasControl) {
      bodyEl.appendChild(root.querySelector('.ha-card'));
    } else {
      bodyEl.textContent = errorMessage || '';
    }
    root.appendChild(overlay);

    // Same fallback priority ChronoCover's own inner title already uses
    // (an explicit title, then the entity's friendly_name, then the
    // entity id itself).
    const headingEl = overlay.querySelector('.heading');
    let resolvedTitle = title;
    if (!resolvedTitle && this._config && this._config.entity) {
      resolvedTitle = (this._entity && this._entity.attributes.friendly_name) || this._config.entity;
    }
    headingEl.textContent = resolvedTitle || '';

    const closeButtonEl = overlay.querySelector('.close-button');
    const resolvedCloseAlign = ccResolveAlignOption(closeAlign, CLOSE_ALIGN_VALUES, 'close_align');
    const resolvedTitleAlign = ccResolveAlignOption(titleAlign, TITLE_ALIGN_VALUES, 'title_align');
    closeButtonEl.style.order = resolvedCloseAlign === 'right' ? '1' : '0';
    closeButtonEl.style.display = resolvedCloseAlign === 'hidden' ? 'none' : '';
    headingEl.style.textAlign = resolvedTitleAlign === 'hidden' ? '' : resolvedTitleAlign;
    headingEl.style.display = resolvedTitleAlign === 'hidden' ? 'none' : '';

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    closeButtonEl.addEventListener('click', () => this.close());
    this._boundPopupKeydown = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._boundPopupKeydown);

    document.body.appendChild(this);
    requestAnimationFrame(() => overlay.classList.add('open'));

    if (hasControl) this._subscribeToUpdates();
  }

  // Removes this element entirely - disconnectedCallback() (above) already
  // clears the relative-time interval and drag listeners as a natural
  // consequence of that removal, so this only needs to handle what's
  // specific to the popup itself.
  close() {
    document.removeEventListener('keydown', this._boundPopupKeydown);
    this._unsubscribeFromUpdates();
    this.remove();
  }

  async _subscribeToUpdates() {
    this._unsubscribeFromUpdates();
    if (!this._hass || !this._hass.connection) return;
    try {
      this._unsub = await this._hass.connection.subscribeEvents(() => {
        this.hass = ccGetHass();
      }, 'state_changed');
    } catch (err) {
      console.warn('chrono-cover: could not subscribe to entity updates - popup will not update live', err);
    }
  }

  _unsubscribeFromUpdates() {
    if (typeof this._unsub === 'function') {
      this._unsub();
    }
    this._unsub = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const entity = hass.states[this._config.entity];
    if (!entity) return;
    this._entity = entity;
    if (!this._dragging) {
      this._relativeTime = ccRelativeTimeText(entity.last_changed);
    }
    this._resolvePreset();
    this._updateUI();
  }
  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 6;
  }

  // Resolves the 3 behavior booleans from, in priority order: an explicit
  // per-boolean config override, then the preset selected by device_type
  // (config override) or the entity's own device_class, falling back to
  // "cover" when neither resolves to a known key.
  _resolvePreset() {
    const key = this._deviceTypeOverride || (this._entity && this._entity.attributes.device_class);
    const preset = (key && DEVICE_TYPE_DEFAULTS[key]) || DEVICE_TYPE_DEFAULTS.cover;
    this._deviceOpenState =
      this._deviceOpenStateOverride !== undefined ? this._deviceOpenStateOverride === true : preset.device_open_state;
    this._deviceOpenPercentage =
      this._deviceOpenPercentageOverride !== undefined
        ? this._deviceOpenPercentageOverride === true
        : preset.device_open_percentage;
    this._deviceOpenSlider =
      this._deviceOpenSliderOverride !== undefined
        ? this._deviceOpenSliderOverride === true
        : preset.device_open_slider;
  }

  // ---- Value conversions (raw HA current_position <-> displayed/slider space) ----
  _rawPosition() {
    if (!this._entity) return null;
    if (this._entity.attributes.current_position != null) return this._entity.attributes.current_position;
    return this._entity.state === 'open' ? 100 : 0;
  }
  _displayPercentage(rawPosition) {
    return this._deviceOpenPercentage ? rawPosition : 100 - rawPosition;
  }
  _sliderFraction(rawPosition) {
    return this._deviceOpenSlider ? rawPosition : 100 - rawPosition;
  }
  _currentValue() {
    const rawPosition = this._rawPosition();
    return rawPosition == null ? null : this._displayPercentage(rawPosition);
  }
  _currentSliderValue() {
    const rawPosition = this._rawPosition();
    return rawPosition == null ? null : this._sliderFraction(rawPosition);
  }

  // ---- DOM construction (built once) ----
  _buildDom() {
    this.attachShadow({ mode: 'open' });
    // Adopted stylesheets always win cascade ties against the inline
    // <style> tag below, regardless of DOM position (same platform
    // behavior chrono-slider-card's v1.3.41 fix relies on) - so state
    // color and, in turn, a person's own override, both reliably win
    // against this element's own static defaults.
    this.shadowRoot.adoptedStyleSheets = [this._stateStyleSheet, this._userStyleSheet];
    this.shadowRoot.innerHTML = `
      <style>${ChronoCover._css()}</style>
      <ha-card class="ha-card">
        <p class="title"></p>
        <div class="state-header">
          <p class="state"></p>
          <p class="percentage"></p>
          <p class="last-changed"></p>
        </div>
        <div class="controls">
          <div class="main-control">
            <div id="slider" class="slider" role="slider" tabindex="0" aria-orientation="vertical">
              <div class="slider-track">
                <div class="slider-track-background"></div>
                <div class="slider-track-bar">
                  <div class="handle"></div>
                </div>
              </div>
              <span class="tooltip"></span>
            </div>
            <div class="control-button-group">
              <button class="control-button control-button-open" aria-label="Open">
                <div class="control-button-shade"></div>
                <svg class="open-icon" viewBox="0 0 24 24"><path class="open-icon-path" d=""></path></svg>
              </button>
              <button class="control-button control-button-stop" aria-label="Stop">
                <div class="control-button-shade"></div>
                <svg class="stop-icon" viewBox="0 0 24 24"><path class="stop-icon-path" d="${ICON_STOP}"></path></svg>
              </button>
              <button class="control-button control-button-close" aria-label="Close">
                <div class="control-button-shade"></div>
                <svg class="close-icon" viewBox="0 0 24 24"><path class="close-icon-path" d=""></path></svg>
              </button>
            </div>
          </div>
          <div class="icon-button-group">
            <button class="icon-toggle-button icon-toggle-button-position" aria-label="Position mode">
              <div class="icon-toggle-shade"></div>
              <svg class="position-mode-icon" viewBox="0 0 24 24"><path class="position-mode-icon-path" d="${ICON_MENU}"></path></svg>
            </button>
            <button class="icon-toggle-button icon-toggle-button-button" aria-label="Button mode">
              <div class="icon-toggle-shade"></div>
              <svg class="button-mode-icon" viewBox="0 0 24 24"><path class="button-mode-icon-path" d="${ICON_SWAP_VERTICAL}"></path></svg>
            </button>
          </div>
        </div>
        <section class="favorites"></section>
      </ha-card>
    `;

    const root = this.shadowRoot;
    this._titleEl = root.querySelector('.title');
    this._stateEl = root.querySelector('.state');
    this._percentageEl = root.querySelector('.percentage');
    this._lastChangedEl = root.querySelector('.last-changed');
    this._controlsEl = root.querySelector('.controls');
    this._sliderEl = root.querySelector('#slider');
    this._tooltipEl = root.querySelector('.tooltip');
    this._buttonGroupEl = root.querySelector('.control-button-group');
    this._openBtnEl = root.querySelector('.control-button-open');
    this._stopBtnEl = root.querySelector('.control-button-stop');
    this._closeBtnEl = root.querySelector('.control-button-close');
    this._openIconPathEl = root.querySelector('.open-icon-path');
    this._closeIconPathEl = root.querySelector('.close-icon-path');
    this._iconGroupEl = root.querySelector('.icon-button-group');
    this._togglePositionBtnEl = root.querySelector('.icon-toggle-button-position');
    this._toggleButtonBtnEl = root.querySelector('.icon-toggle-button-button');
    this._favoritesEl = root.querySelector('.favorites');

    // Static, config-driven visibility - fixed for this instance's lifetime
    // (no visual editor, no live config changes to react to).
    this._titleEl.style.display = this._showName ? '' : 'none';
    this._stateEl.style.display = this._showState ? '' : 'none';
    this._percentageEl.style.display = this._showPercentage ? '' : 'none';
    this._lastChangedEl.style.display = this._showLastChanged ? '' : 'none';
    this._controlsEl.style.display = this._showControls ? '' : 'none';
    this._iconGroupEl.style.display = this._showControlSwitchButtons ? '' : 'none';
    this._favoritesEl.style.display = this._showFavorites ? '' : 'none';

    this._boundPointerMove = (e) => this._onPointerMove(e);
    this._boundPointerUp = () => this._onPointerUp();
    this._sliderEl.addEventListener('pointerdown', (e) => this._onSliderPointerDown(e));
    this._openBtnEl.addEventListener('click', () => this._callDirectional('open'));
    this._stopBtnEl.addEventListener('click', () => this._stopCover());
    this._closeBtnEl.addEventListener('click', () => this._callDirectional('close'));
    this._togglePositionBtnEl.addEventListener('click', () => this._setToggleMode('position'));
    this._toggleButtonBtnEl.addEventListener('click', () => this._setToggleMode('button'));
  }

  _buildFavoriteButtons() {
    if (!this._favoritesEl) return;
    this._favoritesEl.innerHTML = '';
    this._favoriteButtonEls = [];
    this._favoritePositions.forEach((item) => {
      const btn = document.createElement('div');
      btn.className = `favorite-button favorite-button-${item.value}`;
      btn.innerHTML = `<div class="favorite-button-shade"></div><span class="button-label">${item.label}</span>`;
      btn.addEventListener('click', () => this._applyFavorite(item.value));
      this._favoritesEl.appendChild(btn);
      this._favoriteButtonEls.push({ value: item.value, el: btn });
    });
  }

  // ---- Slider drag handling ----
  _valueFromEvent(e) {
    const rect = this._sliderEl.getBoundingClientRect();
    const sliderSize = rect.height - 2 * this._dragHandleMarginPx - HANDLE_SIZE_PX;
    const y = e.clientY - rect.top;
    const value = ((y - this._dragHandleMarginPx - HANDLE_SIZE_PX / 2) / sliderSize) * 100;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  _paint(sliderValue) {
    const fraction = sliderValue / 100;
    this._sliderEl.style.setProperty('--value', fraction.toString());
    const rawPosition = this._sliderFraction(sliderValue);
    this._tooltipEl.textContent = `${this._displayPercentage(rawPosition)}%`;
  }

  _onSliderPointerDown(e) {
    e.preventDefault();
    this._dragging = true;
    this._sliderEl.classList.add('pressed');
    this._tooltipEl.classList.add('visible');
    const computedStyle = getComputedStyle(this._sliderEl);
    const minWidthPx = parseFloat(computedStyle.getPropertyValue('--slider-min-width'));
    const maxWidthPx = parseFloat(computedStyle.getPropertyValue('--slider-max-width'));
    this._dragHandleMarginPx = Math.max(minWidthPx, maxWidthPx) / HANDLE_MARGIN_DIVISOR;
    this._dragValue = this._valueFromEvent(e);
    this._paint(this._dragValue);
    window.addEventListener('pointermove', this._boundPointerMove);
    window.addEventListener('pointerup', this._boundPointerUp);
    window.addEventListener('pointercancel', this._boundPointerUp);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    this._dragValue = this._valueFromEvent(e);
    this._paint(this._dragValue);
  }

  _onPointerUp() {
    if (!this._dragging) return;
    this._dragging = false;
    this._sliderEl.classList.remove('pressed');
    this._tooltipEl.classList.remove('visible');
    this._teardownDragListeners();
    const value = this._dragValue;
    this._dragValue = null;
    if (this._hass && this._config && this._config.entity != null && value != null) {
      const rawValue = this._sliderFraction(value);
      this._hass.callService('cover', 'set_cover_position', {
        entity_id: this._config.entity,
        position: rawValue,
      });
    }
  }

  _teardownDragListeners() {
    window.removeEventListener('pointermove', this._boundPointerMove);
    window.removeEventListener('pointerup', this._boundPointerUp);
    window.removeEventListener('pointercancel', this._boundPointerUp);
  }

  // ---- Control actions ----
  // 'open' (top button) always calls open_cover; 'close' (bottom button)
  // always calls close_cover - unconditional, matching chrono-slider-card's
  // fixed (non-invertible) service-call mapping. device_open_state is
  // never consulted here - it is a display-only concern.
  _callDirectional(action) {
    if (!this._hass || !this._entity) return;
    if (!ccCanOpenCover(this._entity, action === 'open')) return;
    this._hass.callService('cover', `${action}_cover`, { entity_id: this._config.entity });
  }

  _stopCover() {
    if (!this._hass || !this._entity) return;
    this._hass.callService('cover', 'stop_cover', { entity_id: this._config.entity });
  }

  _applyFavorite(pos) {
    if (!this._hass || !this._config || !this._config.entity) return;
    const rawValue = this._deviceOpenPercentage ? pos : 100 - pos;
    this._hass.callService('cover', 'set_cover_position', { entity_id: this._config.entity, position: rawValue });
  }

  _setToggleMode(mode) {
    this._toggleMode = mode;
    try {
      window.localStorage.setItem(
        ccToggleModeStorageKey(this._config.entity),
        mode === 'button' ? 'buttons' : 'slider'
      );
    } catch (e) {
      // localStorage unavailable - toggle still works for this session.
    }
    this._updateUI();
  }

  // ---- Update (imperative DOM patch, called on every hass push) ----
  _updateUI() {
    const entity = this._entity;
    if (!entity) return;

    const value = this._currentValue();
    const sliderValue = this._currentSliderValue();

    this._titleEl.textContent = this._showName
      ? ccExpandEscapedNewlines(this._config.name || entity.attributes.friendly_name || this._config.entity)
      : '';

    const STATE_SWAP = { open: 'closed', closed: 'open', opening: 'closing', closing: 'opening' };
    const effectiveState = this._deviceOpenState ? entity.state : STATE_SWAP[entity.state] ?? entity.state;

    let stateWord = '';
    if (ccIsOpeningCover(entity, this._deviceOpenState)) {
      stateWord = 'Opening';
    } else if (ccIsOpeningCover(entity, !this._deviceOpenState)) {
      stateWord = 'Closing';
    } else if (entity.state === 'open' || entity.state === 'closed') {
      stateWord = ccIsCoverStateClosed(entity, this._deviceOpenState) ? 'Closed' : 'Opened';
    } else {
      stateWord = entity.state;
    }
    this._stateEl.textContent = stateWord;
    this._percentageEl.textContent = `${value}%`;
    this._lastChangedEl.textContent = this._relativeTime ?? '';

    const deviceClass = entity.attributes.device_class;
    const openColor = ccStateColorCssCover(entity.state, deviceClass, 'open');
    const color = ccStateColorCssCover(effectiveState, deviceClass);
    this._stateStyleSheet.replaceSync(
      `.slider { --state-cover-inactive-color: ${openColor}; --slider-color: ${color}; --slider-background: ${color}; }`
    );

    const openDisabled = !ccCanOpenCover(entity, true);
    const closeDisabled = !ccCanOpenCover(entity, false);
    const stopDisabled = entity.state === UNAVAILABLE;
    this._openBtnEl.classList.toggle('disabled', openDisabled);
    this._closeBtnEl.classList.toggle('disabled', closeDisabled);
    this._stopBtnEl.classList.toggle('disabled', stopDisabled);

    this._openIconPathEl.setAttribute('d', ccComputeOpenIcon(entity));
    this._closeIconPathEl.setAttribute('d', ccComputeCloseIcon(entity));

    this._sliderEl.classList.toggle('active', this._toggleMode === 'position');
    this._buttonGroupEl.classList.toggle('active', this._toggleMode === 'button');
    this._togglePositionBtnEl.classList.toggle('selected', this._toggleMode === 'position');
    this._toggleButtonBtnEl.classList.toggle('selected', this._toggleMode === 'button');

    if (this._favoriteButtonEls) {
      this._favoriteButtonEls.forEach(({ value: favValue, el }) => {
        el.classList.toggle('active', favValue === value);
      });
    }

    if (!this._dragging && sliderValue != null) {
      this._paint(sliderValue);
    }
  }

  // ---- Static styles (verbatim from chrono-slider-card's visual design) ----
  static _css() {
    return `
      :host {
        display: block;
        margin: var(--host-margin, 8px);
      }
      ha-card {
        box-sizing: border-box;
        padding: var(--ha-card-padding, 16px 8px 8px 8px);
        display: flex;
        flex-direction: column;
        align-items: center;
        border: none;
      }

      /* ---- Title ---- */
      .title {
        text-align: center;
        white-space: pre;
        margin: 0 0 var(--title-margin-bottom, 16px) 0;
        font-size: var(--title-font-size, 20px);
        line-height: var(--title-line-height, 1.2);
        font-weight: var(--title-font-weight, 500);
        color: var(--primary-text-color);
      }

      /* ---- State + relative-time label ---- */
      .state-header {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .state-header p {
        margin: 0;
        text-align: center;
      }
      .state {
        font-style: normal;
        font-weight: var(--state-font-weight, 400);
        font-size: var(--state-font-size, 36px);
        line-height: var(--state-line-height, 1.2);
        padding: var(--state-padding-top, 9px) 0 var(--state-padding-bottom, 1px) 0;
      }
      .percentage {
        font-style: normal;
        font-size: var(--percentage-font-size, 16px);
        font-weight: var(--percentage-font-weight, 500);
        line-height: var(--percentage-line-height, 1.5);
        letter-spacing: var(--label-letter-spacing, 0.1px);
        padding: var(--percentage-padding-y, 4px) 0;
      }
      .last-changed {
        font-style: normal;
        font-size: var(--last-changed-font-size, 16px);
        font-weight: var(--last-changed-font-weight, 500);
        line-height: var(--last-changed-line-height, 1.5);
        letter-spacing: var(--label-letter-spacing, 0.1px);
        padding: var(--last-changed-padding-y, 4px) 0;
      }

      /* ---- Controls layout ---- */
      .controls {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        width: 100%;
        margin-top: var(--controls-margin-top, 16px);
        margin-bottom: var(--controls-margin-bottom, 8px);
      }
      .main-control {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        width: 100%;
      }
      .main-control > * {
        margin: 0 var(--main-control-item-margin, 8px);
      }

      /* ---- Directional button group (close/stop/open) ---- */
      .control-button-group {
        height: var(--controls-height, 45vh);
        max-height: var(--controls-max-height, 320px);
        min-height: var(--controls-min-height, 200px);
        width: 100%;
        min-width: var(--control-button-group-min-width, 54px);
        max-width: var(--control-button-group-max-width, 100px);
        display: none;
        flex-direction: column;
      }
      .control-button-group.active {
        display: flex;
      }
      .control-button-group > *:not(:last-child) {
        margin-bottom: var(--control-button-group-item-gap, 10px);
      }
      .control-button {
        position: relative;
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        border-radius: var(--control-button-border-radius, 36px);
        overflow: hidden;
        cursor: pointer;
        color: var(--primary-text-color);
        -webkit-tap-highlight-color: transparent;
        border: none;
        padding: var(--control-button-padding, 8px);
        background: none;
        font: inherit;
      }
      .control-button-shade {
        position: absolute;
        inset: 0;
        background-color: var(--disabled-color);
        opacity: var(--overlay-opacity, 0.2);
        transition: background-color var(--transition-duration, 180ms) ease-in-out, opacity var(--transition-duration, 180ms) ease-in-out;
        pointer-events: none;
      }
      .control-button svg {
        width: var(--button-icon-size, 24px);
        height: var(--button-icon-size, 24px);
        fill: currentColor;
        position: relative;
        z-index: 1;
      }
      .control-button:focus-visible {
        box-shadow: 0 0 0 var(--focus-ring-width, 2px) var(--secondary-text-color);
      }
      .control-button.disabled {
        cursor: not-allowed;
        color: var(--disabled-text-color, #6f6f6f);
      }
      .control-button.disabled .control-button-shade {
        opacity: var(--overlay-opacity, 0.2);
      }

      /* ---- Slider ---- */
      .slider {
        display: none;
        position: relative;
        --slider-color: var(--primary-color);
        --slider-background: var(--disabled-color);
        --slider-background-opacity: 0.2;
        --slider-max-width: 130px;
        --slider-min-width: 80px;
        --slider-border-radius: 36px;
        --handle-size: 4px;
        --handle-margin: calc(max(var(--slider-min-width), var(--slider-max-width)) / 8);
        height: var(--controls-height, 45vh);
        max-height: var(--controls-max-height, 320px);
        min-height: var(--controls-min-height, 200px);
        width: 100%;
        min-width: var(--slider-min-width);
        max-width: var(--slider-max-width);
        margin-top: 5px;
        border-radius: var(--slider-border-radius);
        transform: translateZ(0);
        transition: box-shadow var(--transition-duration, 180ms) ease-in-out;
        outline: none;
        cursor: pointer;
        touch-action: none;
      }
      .slider.active {
        display: block;
      }
      .slider:focus-visible {
        box-shadow: 0 0 0 var(--focus-ring-width, 2px) var(--slider-color);
      }
      .slider-track {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: inherit;
      }
      .slider-track-background {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 100%;
        background: var(--slider-background);
        opacity: var(--slider-background-opacity);
      }
      .slider-track-bar {
        --slider-size: calc(100% - 2 * var(--handle-margin) - var(--handle-size));
        position: absolute;
        height: 100%;
        width: 100%;
        background-color: var(--slider-color);
        transition: transform var(--transition-duration, 180ms) ease-in-out, background-color var(--transition-duration, 180ms) ease-in-out;
        top: 0;
        left: 0;
        border-radius: var(--slider-track-bar-border-radius, 8px);
        transform: translate3d(0, calc((var(--value, 0) - 1) * var(--slider-size)), 0);
      }
      .handle {
        position: absolute;
        margin: auto;
        border-radius: var(--handle-size);
        background-color: var(--handle-color, white);
        bottom: var(--handle-margin);
        top: initial;
        right: 0;
        left: 0;
        width: 50%;
        height: var(--handle-size);
      }
      .pressed .slider-track-bar {
        transition: none;
      }
      .tooltip {
        pointer-events: none;
        user-select: none;
        position: absolute;
        background-color: var(--clear-background-color, #212121);
        color: var(--primary-text-color);
        font-size: var(--tooltip-font-size, 20px);
        border-radius: var(--tooltip-border-radius, 12px);
        padding: var(--tooltip-padding, 0.2em 0.4em);
        opacity: 0;
        white-space: nowrap;
        box-shadow: var(--tooltip-shadow, 0 2px 5px rgba(0, 0, 0, 0.2));
        transition: opacity var(--transition-duration, 180ms) ease-in-out, top var(--transition-duration, 180ms) ease-in-out;
        left: var(--tooltip-offset, -4px);
        transform: translate3d(-100%, -50%, 0);
        --handle-spacing: calc(2 * var(--handle-margin) + var(--handle-size));
        --slider-tooltip-range: calc(100% - var(--handle-spacing));
        --slider-tooltip-offset: calc(0.5 * var(--handle-spacing));
        --slider-tooltip-position: calc(
          min(max(var(--value, 0) * var(--slider-tooltip-range) + var(--slider-tooltip-offset), 0%), 100%)
        );
        top: var(--slider-tooltip-position);
      }
      .tooltip.visible {
        opacity: 1;
      }

      /* ---- Slider<->buttons mode-toggle icons ---- */
      .icon-button-group {
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        height: var(--icon-button-group-height, 48px);
        margin-top: var(--controls-gap, 24px);
        border-radius: var(--icon-button-group-border-radius, 9999px);
        background-color: var(--icon-button-group-background, rgba(139, 145, 151, 0.1));
        box-sizing: border-box;
        width: 100%;
        min-width: var(--icon-button-group-min-width, 54px);
        max-width: var(--icon-button-group-max-width, 96px);
        padding: 0;
      }
      .icon-toggle-button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--icon-toggle-button-size, 40px);
        height: var(--icon-toggle-button-size, 40px);
        margin: var(--icon-toggle-button-gap, 4px);
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        color: var(--primary-text-color);
        -webkit-tap-highlight-color: transparent;
      }
      .icon-toggle-button svg {
        width: var(--button-icon-size, 24px);
        height: var(--button-icon-size, 24px);
        fill: currentColor;
        position: relative;
        z-index: 1;
      }
      .icon-toggle-shade {
        opacity: 0;
        transition: opacity var(--transition-duration, 180ms) ease-in-out;
        background-color: var(--primary-text-color);
        border-radius: var(--icon-toggle-border-radius, 9999px);
        height: var(--icon-toggle-button-size, 40px);
        width: var(--icon-toggle-button-size, 40px);
        position: absolute;
        top: var(--icon-toggle-shade-expand, -10px);
        left: var(--icon-toggle-shade-expand, -10px);
        bottom: var(--icon-toggle-shade-expand, -10px);
        right: var(--icon-toggle-shade-expand, -10px);
        margin: auto;
        box-sizing: border-box;
      }
      .icon-toggle-button.selected {
        color: var(--primary-background-color);
      }
      .icon-toggle-button.selected .icon-toggle-shade {
        opacity: 1;
      }
      @media (hover: hover) {
        .icon-toggle-button:not(.selected):hover .icon-toggle-shade {
          opacity: var(--icon-toggle-hover-opacity, 0.1);
        }
      }

      /* ---- Favorite-position buttons ---- */
      .favorites {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        width: 100%;
        max-width: var(--favorites-max-width, none);
        gap: var(--favorite-button-gap, 16px);
        margin-top: var(--favorites-gap, 16px);
        margin-bottom: var(--favorites-margin-bottom, 8px);
        user-select: none;
      }
      .favorite-button {
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        text-align: center;
        width: 100%;
        min-width: var(--favorite-button-min-width, 54px);
        max-width: var(--favorite-button-max-width, 96px);
        height: var(--favorite-button-height, 36px);
        box-sizing: border-box;
        border: none;
        border-radius: var(--favorite-button-border-radius, 9999px);
        margin: 0;
        padding: var(--favorite-button-padding, 8px);
        font-family: var(--favorite-button-font-family, inherit);
        font-weight: var(--favorite-button-font-weight, 500);
        font-size: inherit;
        outline: none;
        background: none;
        color: var(--primary-text-color);
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
        transition: box-shadow var(--transition-duration, 180ms) ease-in-out, color var(--transition-duration, 180ms) ease-in-out;
      }
      .favorite-button-shade {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 100%;
        background-color: var(--disabled-color);
        transition: background-color var(--transition-duration, 180ms) ease-in-out, opacity var(--transition-duration, 180ms) ease-in-out;
        opacity: var(--overlay-opacity, 0.2);
        pointer-events: none;
      }
      .button-label {
        position: relative;
        z-index: 1;
        opacity: var(--favorite-button-label-opacity, 0.95);
      }
      .favorite-button.active .favorite-button-shade {
        background-color: var(--state-cover-active-color, var(--primary-color));
      }

      /* --- Popup chrome (openAsPopup()) --------------------------------- */
      .overlay {
        display: none;
        position: fixed;
        inset: 0;
        z-index: var(--chrono-cover-popup-z-index, 10000);
        background: var(--chrono-cover-popup-backdrop, rgba(0, 0, 0, 0.5));
        align-items: flex-start;
        justify-content: center;
        overflow-y: auto;
      }
      .overlay.open {
        display: flex;
      }
      .frame {
        position: relative;
        box-sizing: border-box;
        width: 90vw;
        max-width: var(--chrono-cover-popup-max-width, 580px);
        margin-top: var(--chrono-cover-popup-margin-top, 10vh);
        background: var(--chrono-cover-popup-background, var(--card-background-color, #1c1c1c));
        border-radius: var(--chrono-cover-popup-border-radius, var(--ha-dialog-border-radius, 24px));
        box-shadow: var(--chrono-cover-popup-box-shadow, 0 8px 32px rgba(0, 0, 0, 0.5));
        font-family: var(--paper-font-body1_-_font-family, inherit);
      }
      /* Matches native HA's own reported behavior: below this viewport
         width, native drops its floating-dialog chrome for an
         edge-to-edge full-screen surface. Width/mechanism only - native's
         vertical behavior was not verified in this session. */
      @media (max-width: 450px) {
        .frame {
          width: 100vw;
          max-width: 100vw;
          margin-top: 0;
          border-radius: 0;
          box-shadow: none;
        }
      }
      .header {
        display: flex;
        align-items: center;
        padding: 0 8px;
      }
      .heading {
        flex: 1;
        font-size: 24px;
        line-height: 2rem;
        font-weight: 400;
        color: var(--primary-text-color, #fff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .close-button {
        flex: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: var(--primary-text-color, #fff);
        width: 48px;
        height: 48px;
        padding: 12px;
        border-radius: 50%;
        box-sizing: border-box;
      }
      .close-button:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .close-button svg {
        display: block;
        width: 100%;
        height: 100%;
        fill: currentColor;
      }
      .body {
        padding: 0 0 12px 0;
      }
    `;
  }
}

customElements.define('chrono-cover', ChronoCover);

// --- Popup dispatch (fire-dom-event) ---------------------------------------
// Vanilla, self-contained - same architectural rule as ChronoCover itself.
// No persistent singleton host element anymore (v1.3.30 - see version
// history): a fresh <chrono-cover> is created per popup open and removed
// entirely on close, via its own openAsPopup()/close() methods. hass is
// obtained directly via the live <home-assistant> element, since a
// dynamically-created element appended to document.body never receives
// .hass automatically the way a placed card does.

const EVENT_KEY = 'chrono-cover';

// Valid values for close_align / title_align, each defaulting to "left".
// Invalid supplied values fall back to "left" via ccResolveAlignOption(),
// with a console.warn().
const CLOSE_ALIGN_VALUES = ['left', 'right', 'hidden'];
const TITLE_ALIGN_VALUES = ['left', 'right', 'center', 'hidden'];

function ccResolveAlignOption(value, validValues, optionName) {
  if (value === undefined) return 'left';
  if (validValues.includes(value)) return value;
  console.warn(`chrono-cover: invalid ${optionName} "${value}", defaulting to "left".`);
  return 'left';
}

function ccGetHass() {
  const ha = document.querySelector('home-assistant');
  return ha ? ha.hass : undefined;
}

// Runs once per module load - guarded so a duplicate resource load never
// double-registers the listener.
if (!window.__chronoCoverPopupListenerInstalled) {
  window.__chronoCoverPopupListenerInstalled = true;

  document.addEventListener('ll-custom', (ev) => {
    const detail = ev.detail && ev.detail[EVENT_KEY];
    if (!detail) return;
    const { title, close_align, title_align, ...rawConfig } = detail.data || {};
    // The popup header already shows the title - ChronoCover's own inner
    // .title becomes a duplicate in this context only. Only applied here,
    // not as a global default, since a standalone/browser_mod placement
    // still wants its own title. A caller's own explicit show_name in
    // data: always wins.
    const config = { show_name: false, ...rawConfig };
    const el = document.createElement('chrono-cover');
    let errorMessage = null;
    try {
      el.setConfig(config);
    } catch (err) {
      errorMessage = `chrono-cover: ${err.message}`;
    }
    if (!errorMessage) {
      el.hass = ccGetHass();
    }
    el.openAsPopup(title, close_align, title_align, errorMessage);
  });
}
