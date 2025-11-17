/**
 * Cookie Consent Management System
 * GDPR/PECR compliant cookie consent handling
 */

export type CookieCategory = 'essential' | 'analytics' | 'marketing' | 'preferences';

export interface CookieDefinition {
  name: string;
  category: CookieCategory;
  description: string;
  duration: string;
  provider: string;
  purpose: string;
  dataProcessed?: string[];
}

export interface ConsentPreferences {
  essential: boolean; // Always true
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  timestamp: string;
  version: string;
}

export class CookieConsentManager {
  private readonly CONSENT_COOKIE = 'cookie_consent';
  private readonly CONSENT_VERSION = '1.0.0';
  private readonly cookies: CookieDefinition[] = [
    {
      name: 'session_id',
      category: 'essential',
      description: 'Maintains user session state',
      duration: 'Session',
      provider: 'First-party',
      purpose: 'Essential for site functionality'
    },
    {
      name: 'cookie_consent',
      category: 'essential',
      description: 'Stores cookie consent preferences',
      duration: '1 year',
      provider: 'First-party',
      purpose: 'Legal compliance'
    },
    {
      name: '_ga',
      category: 'analytics',
      description: 'Google Analytics tracking',
      duration: '2 years',
      provider: 'Google',
      purpose: 'Website analytics and performance monitoring',
      dataProcessed: ['IP address', 'Browser information', 'Page views']
    },
    {
      name: 'user_preferences',
      category: 'preferences',
      description: 'User interface preferences',
      duration: '1 year',
      provider: 'First-party',
      purpose: 'Remember user settings and preferences'
    }
  ];

  /**
   * Get current consent preferences
   */
  getConsent(): ConsentPreferences | null {
    if (typeof window === 'undefined') return null;

    const consentCookie = this.getCookie(this.CONSENT_COOKIE);
    if (!consentCookie) return null;

    try {
      return JSON.parse(decodeURIComponent(consentCookie));
    } catch {
      return null;
    }
  }

  /**
   * Save consent preferences
   */
  saveConsent(preferences: Omit<ConsentPreferences, 'timestamp' | 'version' | 'essential'>): void {
    const consent: ConsentPreferences = {
      ...preferences,
      essential: true, // Always required
      timestamp: new Date().toISOString(),
      version: this.CONSENT_VERSION
    };

    this.setCookie(this.CONSENT_COOKIE, JSON.stringify(consent), 365);

    // Trigger consent update event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cookieConsentUpdated', {
        detail: consent
      }));
    }

    // Apply consent preferences
    this.applyConsentPreferences(consent);
  }

  /**
   * Accept all cookies
   */
  acceptAll(): void {
    this.saveConsent({
      analytics: true,
      marketing: true,
      preferences: true
    });
  }

  /**
   * Reject all non-essential cookies
   */
  rejectAll(): void {
    this.saveConsent({
      analytics: false,
      marketing: false,
      preferences: false
    });
    this.removeNonEssentialCookies();
  }

  /**
   * Get cookie information for display
   */
  getCookieInfo(): Record<CookieCategory, CookieDefinition[]> {
    return this.cookies.reduce((acc, cookie) => {
      if (!acc[cookie.category]) {
        acc[cookie.category] = [];
      }
      acc[cookie.category].push(cookie);
      return acc;
    }, {} as Record<CookieCategory, CookieDefinition[]>);
  }

  /**
   * Check if a specific category is consented
   */
  hasConsent(category: CookieCategory): boolean {
    if (category === 'essential') return true;

    const consent = this.getConsent();
    return consent ? consent[category] : false;
  }

  /**
   * Apply consent preferences (enable/disable cookies)
   */
  private applyConsentPreferences(consent: ConsentPreferences): void {
    // Disable Google Analytics if not consented
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: consent.analytics ? 'granted' : 'denied'
      });
    }

    // Remove non-consented cookies
    if (!consent.analytics) {
      this.deleteCookie('_ga');
      this.deleteCookie('_ga_*');
      this.deleteCookie('_gid');
    }

    if (!consent.preferences) {
      this.deleteCookie('user_preferences');
    }

    if (!consent.marketing) {
      // Remove marketing cookies
      this.deleteCookie('_fbp');
      this.deleteCookie('_gcl_*');
    }
  }

  /**
   * Remove all non-essential cookies
   */
  private removeNonEssentialCookies(): void {
    if (typeof document === 'undefined') return;

    const cookies = document.cookie.split(';');
    const essentialCookies = this.cookies
      .filter(c => c.category === 'essential')
      .map(c => c.name);

    cookies.forEach(cookie => {
      const [name] = cookie.split('=');
      const cookieName = name.trim();

      if (!essentialCookies.includes(cookieName) && cookieName !== this.CONSENT_COOKIE) {
        this.deleteCookie(cookieName);
      }
    });
  }

  /**
   * Utility: Get cookie value
   */
  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;

    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }

    return null;
  }

  /**
   * Utility: Set cookie
   */
  private setCookie(name: string, value: string, days: number): void {
    if (typeof document === 'undefined') return;

    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);

    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax; Secure`;
  }

  /**
   * Utility: Delete cookie
   */
  private deleteCookie(name: string): void {
    if (typeof document === 'undefined') return;

    // Handle wildcard patterns
    if (name.includes('*')) {
      const pattern = name.replace('*', '.*');
      const regex = new RegExp(`^${pattern}$`);

      document.cookie.split(';').forEach(cookie => {
        const [cookieName] = cookie.split('=');
        if (regex.test(cookieName.trim())) {
          this.deleteCookie(cookieName.trim());
        }
      });
      return;
    }

    // Delete specific cookie
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }
}

// Extend Window interface for gtag
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export const cookieConsentManager = new CookieConsentManager();