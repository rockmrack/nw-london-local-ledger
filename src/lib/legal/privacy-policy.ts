/**
 * Privacy Policy Generator
 * GDPR and UK PECR compliant privacy policy generation
 */

export interface PrivacyPolicyConfig {
  companyName: string;
  companyEmail: string;
  companyAddress: string;
  websiteUrl: string;
  lastUpdated: Date;
  dataProtectionOfficerEmail?: string;
  icoRegistrationNumber?: string;
}

export class PrivacyPolicyGenerator {
  constructor(private config: PrivacyPolicyConfig) {}

  /**
   * Generate a comprehensive GDPR/UK PECR compliant privacy policy
   */
  generatePolicy(): string {
    const {
      companyName,
      companyEmail,
      companyAddress,
      websiteUrl,
      lastUpdated,
      dataProtectionOfficerEmail,
      icoRegistrationNumber
    } = this.config;

    return `
# Privacy Policy

**Last updated: ${lastUpdated.toLocaleDateString('en-GB', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})}**

## 1. Introduction

${companyName} ("we", "our", or "us") operates ${websiteUrl} (the "Service"). This privacy policy explains how we collect, use, disclose, and safeguard your information when you visit our website.

This policy complies with:
- The UK General Data Protection Regulation (UK GDPR)
- The Data Protection Act 2018
- The Privacy and Electronic Communications Regulations (PECR)

${icoRegistrationNumber ? `**ICO Registration Number:** ${icoRegistrationNumber}` : ''}

## 2. Information We Collect

### 2.1 Public Property Data
We collect publicly available property and planning data from:
- HM Land Registry (subject to licence terms)
- Local council planning portals
- Public registers and databases
- Energy Performance Certificate (EPC) register
- Crime statistics from police.uk

### 2.2 User Information
When you use our Service, we may collect:
- **Usage Data:** IP address, browser type, pages visited, time and date of visit
- **Cookie Data:** Preferences and session information
- **Contact Information:** If you contact us or subscribe to updates

### 2.3 Legal Basis for Processing
We process data under the following legal bases:
- **Legitimate Interests:** To provide property information services
- **Public Task:** Processing publicly available government data
- **Consent:** For marketing communications and optional features
- **Legal Obligation:** To comply with applicable laws

## 3. How We Use Information

We use collected information to:
- Provide property search and planning information services
- Improve and optimize our Service
- Send administrative information
- Respond to inquiries and offer support
- Monitor and analyze usage patterns
- Prevent fraudulent activity

## 4. Data Sharing

### 4.1 We DO NOT sell your personal data
We will never sell, rent, or trade your personal information.

### 4.2 Third-Party Services
We may share data with:
- **Analytics providers** (anonymized data only)
- **Cloud service providers** (data processors under contract)
- **Legal authorities** (when required by law)

### 4.3 Public Data Sources
Property data displayed is sourced from public registers and remains subject to the original data controller's terms.

## 5. Data Retention

We retain data for different periods:
- **Public property data:** Updated regularly from source
- **Usage logs:** 90 days
- **User accounts:** Until deletion requested
- **Legal records:** As required by law (typically 6 years)

## 6. Your Rights

Under UK GDPR, you have the right to:
- **Access** your personal data
- **Rectify** inaccurate data
- **Erase** your data ("right to be forgotten")
- **Restrict** processing of your data
- **Data portability**
- **Object** to processing
- **Withdraw consent** at any time

To exercise these rights, contact: ${dataProtectionOfficerEmail || companyEmail}

## 7. Cookies

We use strictly necessary cookies and optional analytics cookies. See our Cookie Policy for details.

### 7.1 Types of Cookies
- **Essential:** Required for basic functionality
- **Analytics:** Help us understand usage (optional)
- **Preferences:** Remember your settings (optional)

## 8. Data Security

We implement appropriate technical and organizational measures including:
- Encryption in transit (HTTPS)
- Encryption at rest for sensitive data
- Regular security assessments
- Access controls and authentication
- Data minimization principles

## 9. International Transfers

We primarily process data within the UK. Any international transfers comply with UK GDPR requirements using:
- Standard contractual clauses
- Adequacy decisions
- Appropriate safeguards

## 10. Children's Privacy

Our Service is not directed to individuals under 16. We do not knowingly collect personal information from children.

## 11. Third-Party Links

Our Service may contain links to third-party websites. We are not responsible for their privacy practices.

## 12. Changes to This Policy

We may update this policy periodically. Changes will be posted on this page with an updated revision date.

## 13. Complaints

You have the right to lodge a complaint with the Information Commissioner's Office (ICO):

Information Commissioner's Office
Wycliffe House
Water Lane
Wilmslow
Cheshire SK9 5AF

Helpline: 0303 123 1113
Website: https://ico.org.uk

## 14. Contact Us

For questions about this policy or your personal data:

${companyName}
${companyAddress}
Email: ${companyEmail}
${dataProtectionOfficerEmail ? `Data Protection Officer: ${dataProtectionOfficerEmail}` : ''}

---

This privacy policy is provided in a machine-readable format and can be accessed via our API at ${websiteUrl}/api/privacy-policy.json
`;
  }

  /**
   * Generate a JSON version for API access
   */
  generateJSON() {
    return {
      version: '1.0.0',
      lastUpdated: this.config.lastUpdated.toISOString(),
      company: {
        name: this.config.companyName,
        email: this.config.companyEmail,
        address: this.config.companyAddress,
        website: this.config.websiteUrl,
        dpo: this.config.dataProtectionOfficerEmail,
        ico: this.config.icoRegistrationNumber
      },
      compliance: ['UK GDPR', 'DPA 2018', 'PECR'],
      dataTypes: [
        'Public property data',
        'Usage data',
        'Cookie data',
        'Contact information'
      ],
      rights: [
        'access',
        'rectification',
        'erasure',
        'restriction',
        'portability',
        'objection',
        'withdraw consent'
      ],
      retention: {
        publicData: 'regularly updated',
        usageLogs: '90 days',
        userAccounts: 'until deletion',
        legalRecords: '6 years'
      },
      security: [
        'Encryption in transit',
        'Encryption at rest',
        'Access controls',
        'Regular assessments'
      ],
      contact: {
        ico: {
          url: 'https://ico.org.uk',
          phone: '0303 123 1113',
          address: 'Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF'
        }
      }
    };
  }
}