/**
 * NetXpert — Haptic Feedback Engine
 * Compliant with Section 3.5 of NETXPERT_UI_SPEC.md
 * Uses Web Vibration API when available on Android / mobile browsers.
 */

export const triggerHaptic = (
  type: 'start' | 'phase' | 'success' | 'error' | 'tick'
) => {
  if (typeof window === 'undefined' || !navigator.vibrate) return;

  try {
    switch (type) {
      case 'start':
        // Medium impact
        navigator.vibrate(30);
        break;
      case 'phase':
        // Selection tick
        navigator.vibrate(15);
        break;
      case 'success':
        // Notification success: double pulse
        navigator.vibrate([20, 50, 40]);
        break;
      case 'error':
        // Notification error: triple warning pulse
        navigator.vibrate([40, 60, 40, 60, 50]);
        break;
      case 'tick':
        navigator.vibrate(8);
        break;
    }
  } catch {
    // Vibration ignored if browser policy blocks it without prior user gesture
  }
};
