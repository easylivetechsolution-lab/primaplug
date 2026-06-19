import { Link, useLocation } from 'react-router-dom'

const UPDATED_AT = 'June 2, 2026'

const privacySections = [
  {
    title: '1. Who We Are',
    body: 'PrimaPlug, also called Prima in the app, operates a marketplace that helps users discover gigs, post work, apply for opportunities, communicate, track agreed work, confirm receipts, manage platform credits, and handle related account activity.'
  },
  {
    title: '2. Information We Collect',
    body: 'We collect account information such as name, email, phone number, username, profile photo, location, skills, bio, verification details, device and login information, gig posts, applications, messages, notifications, reviews, receipt confirmations, payment references, commission records, emergency reports, support messages, and other information you choose to provide.'
  },
  {
    title: '3. How We Use Information',
    body: 'We use information to create and secure accounts, match clients and workers, display profiles and gigs, process applications, open conversations, send notifications, calculate commissions, verify payments, support referrals and credits, prevent fraud, investigate disputes, improve the service, and comply with legal or safety obligations.'
  },
  {
    title: '4. Marketplace Visibility',
    body: 'Profile details, ratings, trust score, gigs, applications, reviews, and selected location details may be visible to other users where needed to operate the marketplace. Exact physical addresses should only be shared with accepted workers or relevant parties when the gig requires it.'
  },
  {
    title: '5. Messages and Safety Reviews',
    body: 'Messages and related activity may be stored so users can coordinate work and so Prima can investigate abuse, fraud, disputes, emergency reports, payment issues, or violations of our Terms.'
  },
  {
    title: '6. Payments',
    body: 'Prima may use Fincra and other payment, banking, or payout providers to process or verify payments. We do not store full card numbers. Payment providers may process payment data under their own privacy notices. Prima may store transaction references, payment status, commission records, payout records, and receipts.'
  },
  {
    title: '7. Service Providers',
    body: 'We may share limited information with hosting, authentication, database, analytics, cloud storage, messaging, push notification, payment, fraud prevention, and customer support providers where necessary to run Prima.'
  },
  {
    title: '8. Legal, Safety, and Fraud Prevention',
    body: 'We may disclose information if required by law, to protect users or the public, to prevent fraud or abuse, to enforce our agreements, to respond to lawful requests, or to protect the rights, safety, and property of Prima, users, and partners.'
  },
  {
    title: '9. Data Retention',
    body: 'We keep information for as long as needed to provide the service, resolve disputes, meet accounting and legal obligations, enforce policies, prevent fraud, and maintain marketplace records. Some deleted account data may remain in backups, logs, transaction records, or dispute records where legally or operationally necessary.'
  },
  {
    title: '10. Your Choices',
    body: 'You may update profile information in the app, manage notification settings where available, request account support, and ask us to review, correct, export, or delete eligible personal information. Some requests may be limited by safety, anti-fraud, legal, accounting, or dispute-resolution requirements.'
  },
  {
    title: '11. Security',
    body: 'We use reasonable technical and organizational safeguards to protect information, but no online service is completely secure. Users are responsible for keeping login details safe and reporting suspicious activity quickly.'
  },
  {
    title: '12. Children',
    body: 'Prima is not intended for children under 18. Users must be legally able to enter into agreements and perform or request services in their location.'
  },
  {
    title: '13. International Use',
    body: 'Your information may be processed in countries where Prima, our infrastructure providers, or our service providers operate. By using Prima, you understand that data may be transferred and processed outside your country of residence.'
  },
  {
    title: '14. Contact',
    body: 'Questions or privacy requests can be sent to privacy@primaplug.com. Payment-related requests can be sent to payments@primaplug.com.'
  }
]

const termsSections = [
  {
    title: '1. Acceptance of Terms',
    body: 'By creating an account, browsing, posting, applying for, accepting, completing, paying for, or communicating about work through Prima, you agree to these Terms of Service and our Privacy Policy.'
  },
  {
    title: '2. The Prima Marketplace',
    body: 'Prima is a marketplace and coordination platform. Clients post gigs or order services, and workers apply for or accept work. Unless separately stated in writing, Prima is not the employer, employee, agent, partner, or insurer of any user.'
  },
  {
    title: '3. Account Eligibility',
    body: 'You must be at least 18 years old, legally able to contract, and provide accurate account information. You are responsible for activity on your account and must not transfer, sell, or share access in a way that creates fraud, impersonation, or security risk.'
  },
  {
    title: '4. User Responsibilities',
    body: 'Users must communicate honestly, show up for accepted work, perform agreed services professionally, pay agreed amounts, confirm receipts truthfully, follow applicable laws, and treat other users respectfully.'
  },
  {
    title: '5. Gigs, Applications, and Acceptance',
    body: 'Clients are responsible for describing work accurately, including pay, timing, location, requirements, and risks. Workers are responsible for reviewing details before applying or accepting. Once accepted, both parties should coordinate through Prima and keep records of important changes.'
  },
  {
    title: '6. Payments, Receipts, and Commission',
    body: 'Prima may support direct payment coordination, receipt confirmation, Prima Credits, Fincra payments, bank transfer instructions, withdrawals, and platform commission tracking. Users must not submit false payment confirmations or manipulated receipts. Platform commissions, fees, due dates, and penalties shown in the app apply unless Prima corrects an error.'
  },
  {
    title: '7. No Circumvention',
    body: 'Users must not use Prima to find each other and then bypass required platform fees, commissions, safety workflows, or dispute processes. Prima may restrict accounts, reduce trust scores, cancel credits, or pursue unpaid amounts where circumvention is detected.'
  },
  {
    title: '8. Reviews, Trust Scores, and Credits',
    body: 'Prima may calculate trust scores, levels, reviews, referrals, credits, penalties, and account standing using user activity. New accounts start with a trust score and rating of 0, which progress as the user completes work and receives feedback. These systems are operational tools and may be adjusted to correct errors, prevent abuse, or protect marketplace quality.'
  },
  {
    title: '9. Prohibited Conduct',
    body: 'You must not post illegal, unsafe, discriminatory, exploitative, deceptive, adult, violent, or harmful work; harass users; impersonate others; spam; scrape data; attack the service; manipulate payments; submit false reports; or use Prima for fraud or money laundering.'
  },
  {
    title: '10. Safety and Emergency Reports',
    body: 'Users are responsible for personal safety when meeting or performing work. Use caution, verify details, and report concerns. Emergency reports must be truthful and used only for genuine safety concerns. False emergency reports may lead to suspension or removal.'
  },
  {
    title: '11. Disputes',
    body: 'Prima may provide tools to review payment, receipt, completion, review, or conduct disputes. We may request evidence, messages, receipts, identity details, or other records. Prima may make marketplace decisions such as account restrictions, trust-score changes, credit adjustments, or commission status updates, but we are not a court or legal representative.'
  },
  {
    title: '12. Content and License',
    body: 'You keep ownership of content you submit, but you grant Prima a worldwide, non-exclusive, royalty-free license to host, display, reproduce, modify for formatting, and use that content to operate, improve, promote, and protect the service.'
  },
  {
    title: '13. Suspension and Termination',
    body: 'Prima may suspend, restrict, or terminate accounts for policy violations, fraud risk, unpaid commissions, safety concerns, legal compliance, repeated disputes, or conduct that harms the marketplace. Users may stop using Prima at any time, subject to unresolved obligations.'
  },
  {
    title: '14. Disclaimers',
    body: 'Prima is provided on an as-is and as-available basis. We do not guarantee that every user is qualified, that every gig will be completed, that payments outside Prima-controlled processors will be made, or that the service will be uninterrupted or error-free.'
  },
  {
    title: '15. Limitation of Liability',
    body: 'To the maximum extent permitted by law, Prima will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost data, user conduct, off-platform payments, or disputes between users.'
  },
  {
    title: '16. Changes to These Terms',
    body: 'We may update these Terms as the service changes. Continued use of Prima after an update means you accept the updated Terms. Material updates may be announced in the app or by other reasonable means.'
  },
  {
    title: '17. Contact',
    body: 'Questions about these Terms can be sent to legal@primaplug.com. Payment questions can be sent to payments@primaplug.com.'
  }
]

export default function LegalPage({ type }) {
  const location = useLocation()
  const pageType = type || (location.pathname.includes('privacy') ? 'privacy' : 'terms')
  const isPrivacy = pageType === 'privacy'
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service'
  const sections = isPrivacy ? privacySections : termsSections

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8F7FF',
      color: '#14123A',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      padding: '28px 18px 48px'
    }}>
      <main style={{
        maxWidth: '880px',
        margin: '0 auto',
        background: '#fff',
        border: '1.5px solid #E2E0FF',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 12px 36px rgba(108,71,255,0.08)'
      }}>
        <Link to="/" style={{
          color: '#6C47FF',
          textDecoration: 'none',
          fontWeight: '800',
          fontSize: '13px'
        }}>
          PrimaPlug
        </Link>
        <h1 style={{
          fontSize: '30px',
          lineHeight: 1.15,
          margin: '18px 0 8px',
          fontWeight: '900'
        }}>
          {title}
        </h1>
        <p style={{ margin: '0 0 18px', color: '#8B8FAF', fontSize: '13px' }}>
          Last updated: {UPDATED_AT}
        </p>
        <div style={{
          background: '#F5F4FF',
          border: '1.5px solid #E2E0FF',
          borderRadius: '12px',
          padding: '14px 16px',
          color: '#4E4A78',
          fontSize: '13px',
          lineHeight: 1.7,
          marginBottom: '20px'
        }}>
          This document is a company operating policy for PrimaPlug's marketplace. It should be reviewed by qualified legal counsel before relying on it as final legal advice.
        </div>
        {sections.map(section => (
          <section key={section.title} style={{ marginBottom: '18px' }}>
            <h2 style={{
              fontSize: '16px',
              lineHeight: 1.35,
              margin: '0 0 7px',
              fontWeight: '800'
            }}>
              {section.title}
            </h2>
            <p style={{
              margin: 0,
              color: '#4E4A78',
              fontSize: '14px',
              lineHeight: 1.75
            }}>
              {section.body}
            </p>
          </section>
        ))}
      </main>
    </div>
  )
}
