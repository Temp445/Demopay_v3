import React from 'react';
import { useNavigate } from 'react-router-dom';

const TermsOfService: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
      <h1 className="text-2xl font-bold text-center mb-4">Terms of Service</h1>
      <p className="text-sm text-gray-500 text-center">
        Effective Date: February 3, 2025
      </p>

      <div className="mt-6 text-gray-800 space-y-4">
        <div className="p-6 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
          <p>
            Welcome to Payroll, a SaaS product provided by Ace Software Solutions
            Pvt Ltd. By accessing or using our software, you agree to be bound
            by these Terms of Service. If you do not agree to these terms,
            please do not use the software.
          </p>

          <h2 className="font-bold">1. Acceptance of Terms</h2>
          <p>
            By using Payroll, you confirm that you are at least 18 years old and
            have the legal authority to enter into this agreement. Your
            continued use of the software signifies your acceptance of these
            terms.
          </p>

          <h2 className="font-bold">2. Subscription and Payment</h2>
          <p>
            Payroll offers both free and paid subscription plans. Paid subscriptions
            require payment through our authorized payment gateway, Razorpay.
            Subscription fees are non-refundable, except in cases of duplicate
            payments or technical issues that prevent access. We reserve the
            right to modify subscription fees at any time with prior notice.
          </p>

          <h2 className="font-bold">3. User Responsibilities</h2>
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials. You agree not to misuse, copy, or distribute
            any part of the software without authorization. You shall not use
            Payroll for any illegal or unauthorized purpose.
          </p>

          <h2 className="font-bold">4. Data Privacy and Security</h2>
          <p>
            We prioritize data security and comply with relevant data protection
            laws. Our Privacy Policy outlines how we collect, store, and use
            your data. You retain ownership of the data you upload but grant us
            permission to store and process it as required for service
            functionality.
          </p>

          <h2 className="font-bold">5. Shipping & Delivery of Services</h2>
          <p>
            Payroll is a cloud-based SaaS product, and no physical goods are
            shipped. Upon successful payment, users receive instant access to
            the software. In rare cases of technical issues, access may take up
            to a maximum of 24 hours. If you do not receive access within this
            timeframe, please contact our support team for assistance.
          </p>

          <h2 className="font-bold">6. Limitations of Liability</h2>
          <p>
            Payroll is provided "as is" without warranties of any kind. We shall not
            be liable for any direct, indirect, incidental, or consequential
            damages arising from your use of the software. We do not guarantee
            uninterrupted or error-free service but will make reasonable efforts
            to maintain reliability.
          </p>

          <h2 className="font-bold">7. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access if you
            violate these terms. Users may cancel their subscriptions at any
            time, but no refunds will be provided unless explicitly stated.
          </p>

          <h2 className="font-bold">8. Changes to Terms</h2>
          <p>
            We may update these Terms of Service from time to time. Continued
            use of Payroll after changes are posted constitutes acceptance of the
            revised terms.
          </p>

          <h2 className="font-bold">9. Contact Information</h2>
          <p>
            For any questions or concerns regarding these terms, please contact
            us at:
            <br />
            <strong>Ace Software Solutions Pvt Ltd</strong>
            <br />
            No. 19/9, Brindhavan Apartments, Flat - B, Tamilar Street,
            Choolaimedu, Chennai, Tamil Nadu 600094, India.
            <br />
            <strong>Email:</strong> marketing@acesoft.in
            <br />
            <strong>Phone:</strong> 9840137210
          </p>

          <p>
            By using Payroll, you acknowledge that you have read, understood, and
            agreed to these Terms of Service.
          </p>
        </div>
      </div>
      <div className="flex justify-center mt-6">
        <button
          onClick={() => navigate(-1)}
          className="bg-indigo-500 text-white px-6 py-2 rounded-lg hover:bg-indigo-600 transition"
        >
          Close
        </button>
      </div>
    </div>

    // </div>
  );
};

export default TermsOfService;
