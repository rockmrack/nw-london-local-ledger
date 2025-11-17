/**
 * Terms of Service Generator
 * Comprehensive terms of service for property data platform
 */

export interface TermsConfig {
  companyName: string;
  companyEmail: string;
  companyAddress: string;
  websiteUrl: string;
  lastUpdated: Date;
  jurisdiction: string;
  disputeResolution: 'arbitration' | 'litigation';
}

export class TermsOfServiceGenerator {
  constructor(private config: TermsConfig) {}

  /**
   * Generate comprehensive terms of service
   */
  generateTerms(): string {
    const {
      companyName,
      companyEmail,
      companyAddress,
      websiteUrl,
      lastUpdated,
      jurisdiction,
      disputeResolution
    } = this.config;

    return `
# Terms of Service

**Last Updated: ${lastUpdated.toLocaleDateString('en-GB', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})}**

## 1. Agreement to Terms

By accessing or using ${websiteUrl} ("Service"), operated by ${companyName} ("we", "our", or "us"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, you do not have permission to access the Service.

## 2. Description of Service

### 2.1 Property Information Platform
We provide a platform that aggregates and displays publicly available property, planning, and local area information for North West London. This includes:
- Property sales data from HM Land Registry
- Planning applications from local councils
- Energy Performance Certificates
- Crime statistics
- Transport information
- Local amenities data

### 2.2 Data Sources
All property and planning data displayed is sourced from public registers and government databases. We do not guarantee the accuracy, completeness, or timeliness of third-party data.

## 3. Acceptable Use

### 3.1 Permitted Use
You may use the Service for:
- Personal property research
- Market analysis
- Educational purposes
- Professional property services (subject to commercial terms)

### 3.2 Prohibited Use
You may NOT:
- Scrape, harvest, or systematically extract data without permission
- Use automated systems or bots without our express consent
- Violate any applicable laws or regulations
- Misrepresent data sourced from our Service
- Attempt to gain unauthorized access to our systems
- Use the Service for any illegal or fraudulent purpose
- Resell or redistribute our data without a commercial license
- Circumvent any access restrictions or rate limits

## 4. Intellectual Property Rights

### 4.1 Our Content
The Service and its original content (excluding third-party data) are and will remain the exclusive property of ${companyName} and its licensors. Our trademarks and trade dress may not be used without our prior written consent.

### 4.2 Third-Party Data
Property data remains subject to the original data controller's terms:
- HM Land Registry data is subject to Crown copyright
- Council planning data is subject to local authority terms
- Other public data sources retain their respective rights

### 4.3 User Contributions
Any feedback, suggestions, or contributions you provide become our property and may be used without compensation to you.

## 5. Data Accuracy and Disclaimers

### 5.1 No Warranty
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
- Accuracy or completeness of data
- Fitness for a particular purpose
- Non-infringement
- Continuous or error-free operation

### 5.2 Third-Party Data Disclaimer
We aggregate data from various public sources but do not verify its accuracy. Users should:
- Verify important information independently
- Consult official sources for critical decisions
- Seek professional advice for property transactions

### 5.3 No Professional Advice
The Service does not constitute legal, financial, or professional advice. Always consult qualified professionals for property decisions.

## 6. Limitation of Liability

### 6.1 Exclusion of Damages
TO THE FULLEST EXTENT PERMITTED BY LAW, ${companyName.toUpperCase()} SHALL NOT BE LIABLE FOR:
- Indirect, incidental, special, or consequential damages
- Loss of profits, revenue, or data
- Property transaction losses or damages
- Decisions made based on our data
- Service interruptions or data loss

### 6.2 Maximum Liability
Our total liability shall not exceed £100 or the amount paid by you to us in the 12 months preceding the claim, whichever is greater.

## 7. API and Data Access

### 7.1 API Terms
If we provide API access:
- You must comply with rate limits
- Commercial use requires a separate license
- We may suspend access for violations
- API availability is not guaranteed

### 7.2 Data Licensing
Bulk data access or commercial use requires a separate commercial license agreement. Contact us for pricing.

## 8. Privacy and Data Protection

Your use of our Service is subject to our Privacy Policy. We comply with UK GDPR and the Data Protection Act 2018.

## 9. Account Terms

### 9.1 Account Responsibility
If you create an account:
- You are responsible for maintaining security
- You must provide accurate information
- You are responsible for all activity under your account
- You must notify us of unauthorized use

### 9.2 Account Termination
We may suspend or terminate accounts that:
- Violate these Terms
- Engage in fraudulent activity
- Abuse the Service
- Remain inactive for extended periods

## 10. Modifications

### 10.1 Terms Changes
We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Continued use constitutes acceptance of modified Terms.

### 10.2 Service Changes
We may modify, suspend, or discontinue any part of the Service without notice or liability.

## 11. Indemnification

You agree to indemnify and hold harmless ${companyName}, its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from:
- Your use of the Service
- Your violation of these Terms
- Your violation of any third-party rights
- Your use of data obtained through the Service

## 12. Governing Law

### 12.1 Jurisdiction
These Terms are governed by the laws of ${jurisdiction} without regard to conflict of law provisions.

### 12.2 Dispute Resolution
${disputeResolution === 'arbitration' ? `
Disputes shall be resolved through binding arbitration in accordance with the rules of the London Court of International Arbitration (LCIA). The arbitration shall be conducted in London, England.
` : `
Any disputes shall be resolved exclusively in the courts of ${jurisdiction}. You consent to the personal jurisdiction of such courts.
`}

## 13. Severability

If any provision of these Terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.

## 14. Entire Agreement

These Terms, together with our Privacy Policy and any additional agreements, constitute the entire agreement between you and ${companyName}.

## 15. Contact Information

For questions about these Terms, please contact us at:

${companyName}
${companyAddress}
Email: ${companyEmail}

## 16. Special Terms for Data Sources

### 16.1 HM Land Registry
Use of Land Registry data is subject to the Open Government Licence v3.0. Users must acknowledge "© Crown copyright and database rights [year] OS [number]" where applicable.

### 16.2 Local Council Data
Planning data from local councils is provided under various open data licenses. Users should check individual council terms.

### 16.3 Energy Performance Data
EPC data is subject to the Open Government Licence. Commercial use may require additional licensing.

## 17. Accessibility

We are committed to making our Service accessible to all users and comply with the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA.

## 18. Force Majeure

We shall not be liable for any failure to perform due to causes beyond our reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, strikes, or pandemic.

---

By using ${websiteUrl}, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
`;
  }

  /**
   * Generate JSON version for API access
   */
  generateJSON() {
    return {
      version: '1.0.0',
      lastUpdated: this.config.lastUpdated.toISOString(),
      company: {
        name: this.config.companyName,
        email: this.config.companyEmail,
        address: this.config.companyAddress,
        website: this.config.websiteUrl
      },
      governance: {
        jurisdiction: this.config.jurisdiction,
        disputeResolution: this.config.disputeResolution
      },
      acceptableUse: {
        permitted: [
          'Personal property research',
          'Market analysis',
          'Educational purposes',
          'Professional services'
        ],
        prohibited: [
          'Data scraping without permission',
          'Automated extraction',
          'Illegal activities',
          'Data misrepresentation',
          'Unauthorized access',
          'Rate limit circumvention'
        ]
      },
      liability: {
        warrantyDisclaimer: true,
        limitationAmount: '£100 or fees paid',
        indemnification: true
      },
      dataTerms: {
        landRegistry: 'OGL v3.0',
        councils: 'Various open licenses',
        epc: 'Open Government Licence'
      }
    };
  }
}