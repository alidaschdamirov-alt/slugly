import { Link } from "wouter";

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-primary hover:opacity-80">Slugly</Link>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">{title}</h1>
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:leading-relaxed">
          {children}
        </div>
      </main>
      <footer className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
        <Link href="/terms" className="hover:underline">Terms</Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <span className="mx-2">·</span>
        <Link href="/aup" className="hover:underline">Acceptable Use</Link>
      </footer>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p><strong>Last updated:</strong> June 2026</p>
      <h2>1. Acceptance of Terms</h2>
      <p>By accessing or using Slugly ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
      <h2>2. Description of Service</h2>
      <p>Slugly provides URL shortening, link management, analytics, and related services. We reserve the right to modify, suspend, or discontinue any part of the Service at any time.</p>
      <h2>3. User Accounts</h2>
      <p>You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.</p>
      <h2>4. Acceptable Use</h2>
      <p>You agree not to use the Service for any unlawful purpose or in violation of our <Link href="/aup" className="text-primary hover:underline">Acceptable Use Policy</Link>. We reserve the right to terminate accounts that violate these terms.</p>
      <h2>5. Intellectual Property</h2>
      <p>The Service and its original content, features, and functionality are owned by Slugly and are protected by international copyright, trademark, and other intellectual property laws.</p>
      <h2>6. Limitation of Liability</h2>
      <p>The Service is provided "as is" without warranties of any kind. In no event shall Slugly be liable for any indirect, incidental, special, or consequential damages.</p>
      <h2>7. Changes to Terms</h2>
      <p>We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
      <h2>8. Contact</h2>
      <p>For questions about these Terms, please contact us through the Service.</p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p><strong>Last updated:</strong> June 2026</p>
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide directly (account details, links you create) and information collected automatically (click analytics, IP addresses, user agents, referrers).</p>
      <h2>2. How We Use Information</h2>
      <p>We use collected information to provide and improve the Service, generate analytics for link owners, detect abuse, and comply with legal obligations.</p>
      <h2>3. Data Retention</h2>
      <p>We retain your data for as long as your account is active. Click analytics data is retained according to your plan tier (Free: 30 days, Pro: unlimited). You may request deletion at any time.</p>
      <h2>4. IP Address Handling</h2>
      <p>IP addresses are hashed before storage for analytics purposes. We do not store raw IP addresses in click logs. The hash is used only for unique visitor counting and cannot be reversed to identify individuals.</p>
      <h2>5. Cookies</h2>
      <p>We use essential cookies for authentication and session management. Analytics cookies are used only with your consent. You can manage cookie preferences at any time.</p>
      <h2>6. Third-Party Services</h2>
      <p>We may use third-party services for hosting, analytics, and payment processing. These services have their own privacy policies.</p>
      <h2>7. Your Rights (GDPR)</h2>
      <p>You have the right to access, export, correct, and delete your personal data. Use the "Privacy & Data" section in your account settings to exercise these rights.</p>
      <h2>8. Data Security</h2>
      <p>We implement appropriate technical and organizational measures to protect your data. However, no method of transmission over the Internet is 100% secure.</p>
      <h2>9. Changes to This Policy</h2>
      <p>We will notify you of material changes to this policy via the Service or email.</p>
      <h2>10. Contact</h2>
      <p>For privacy-related inquiries, please contact us through the Service.</p>
    </LegalLayout>
  );
}

export function AupPage() {
  return (
    <LegalLayout title="Acceptable Use Policy">
      <p><strong>Last updated:</strong> June 2026</p>
      <h2>1. Prohibited Content</h2>
      <p>You may not use Slugly to shorten links that point to:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Malware, viruses, or other harmful software</li>
        <li>Phishing pages or credential-harvesting sites</li>
        <li>Content that promotes violence, terrorism, or hate speech</li>
        <li>Child sexual abuse material (CSAM)</li>
        <li>Illegal drug sales or other criminal activity</li>
        <li>Copyright-infringing content at scale</li>
        <li>Spam or deceptive advertising</li>
      </ul>
      <h2>2. Prohibited Behavior</h2>
      <p>You may not:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Create links designed to deceive users about their destination</li>
        <li>Use the Service to circumvent content filters or security measures</li>
        <li>Automate link creation in a way that degrades the Service for others</li>
        <li>Attempt to reverse-engineer or attack the Service infrastructure</li>
        <li>Impersonate other users or organizations</li>
      </ul>
      <h2>3. Enforcement</h2>
      <p>Violations may result in link removal, account suspension, or permanent ban. We may report illegal activity to law enforcement. We cooperate with abuse reports and respond within 24 hours.</p>
      <h2>4. Reporting Abuse</h2>
      <p>To report a link that violates this policy, use our <Link href="/report" className="text-primary hover:underline">report page</Link> or contact us directly.</p>
    </LegalLayout>
  );
}
