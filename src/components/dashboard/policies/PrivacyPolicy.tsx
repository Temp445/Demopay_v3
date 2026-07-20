import React from "react";
import { useNavigate } from "react-router-dom";

const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">      
      <h1 className="text-2xl font-bold text-center mb-4">Privacy Policy</h1>
      <p className="text-sm text-gray-500 text-center">Effective Date: February 3, 2025</p>

      <div className="mt-6 text-gray-800 space-y-4">
        <div className="p-6 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
          <p>
            At Ace Software Solutions Pvt Ltd, we value your privacy. This Privacy Policy describes how we collect, use, and protect your personal information when you use our Customer Relationship Management.
          </p>

          <h2 className="font-bold">1. Information We Collect</h2>
          <p>
            <strong>Personal Information:</strong> When you sign up for Payroll Management System, we collect personal details such as your name, email address, company name, and payment information.
            <br />
            <strong>Usage Information:</strong> We also collect usage data, such as the pages you visit, the actions you take, and the technical data related to your device (such as IP address, browser type, and operating system).
          </p>

          <h2 className="font-bold">2. How We Use Your Information</h2>
          <p>
            - To provide and maintain the service.
            <br />
            - To communicate with you, including sending transactional or promotional emails (with your consent).
            <br />
            - To improve the service and enhance user experience.
          </p>

          <h2 className="font-bold">3. Sharing of Information</h2>
          <p>
            We do not sell or rent your personal information to third parties.
            <br />
            We may share your information with third-party service providers, such as payment processors (e.g., Razorpay), for the sole purpose of providing the services requested.
          </p>

          <h2 className="font-bold">4. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your information from unauthorized access, use, or disclosure.
          </p>

          <h2 className="font-bold">5. Your Rights</h2>
          <p>
            - You can access, correct, or delete your personal information by contacting us.
            <br />
            - You can opt-out of marketing communications at any time.
          </p>

          <h2 className="font-bold">6. Payment Processing</h2>
          <p>
            We use Razorpay to process payments. Your payment data is securely handled by Razorpay in accordance with their Privacy Policy and PCI-DSS standards.
          </p>

          <h2 className="font-bold">7. Changes to Privacy Policy</h2>
          <p>
            We reserve the right to modify this privacy policy at any time. Any updates will be posted on this page with an updated effective date.
          </p>

          <h2 className="font-bold">Contact Information</h2>
          <p>
            For any questions or concerns about your privacy, please contact us at:
            <br />
            <strong>Ace Software Solutions Pvt Ltd</strong>
            <br />
            No. 19/9, Brindhavan Apartments, Flat - B, Tamilar Street, Choolaimedu, Chennai, Tamil Nadu 600094, India.
            <br />
            <strong>Email:</strong> marketing@acesoft.in
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
  );
};

export default PrivacyPolicy;