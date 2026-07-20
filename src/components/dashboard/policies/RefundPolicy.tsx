import { useNavigate } from "react-router-dom";

export const RefundPolicy = () => {
  const navigate = useNavigate();

  return (    
    <div className="p-6 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">      
      <h1 className="text-2xl font-bold text-center mb-4">Refund Policy</h1>
      <p className="text-sm text-gray-500 text-center">Effective Date: February 4, 2025</p>

      <div className="mt-6 text-gray-800 space-y-4">
        <div className="p-6 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
          <p>
            At Ace Software Solutions Pvt Ltd, we want to ensure you are completely satisfied with your purchase of Payroll. However, please note the following regarding our Refund Policy:
          </p>

          <h2 className="font-bold">1. No Refund Policy</h2>
          <p>
            Once a subscription is purchased, no refunds will be provided for any reason, including but not limited to dissatisfaction with the service or accidental purchases. Users may cancel their subscription at any time, but cancellations will not result in a refund.
          </p>

          <h2 className="font-bold">2. Exceptions</h2>
          <p>
            Refunds may only be considered in the following cases:
          </p>
          <ul>
            <li>
              <strong>Duplicate Payments:</strong> If a customer accidentally makes a duplicate payment, a refund for the additional charge may be issued.
            </li>
            <li>
              <strong>Technical Issues:</strong> If the software is inaccessible due to a technical issue caused by us, we will work to resolve it or may issue a refund, subject to investigation.
            </li>
          </ul>

          <h2 className="font-bold">3. Cancellation</h2>
          <p>
            Users can cancel their subscription at any time via their account settings. However, cancellations will not result in a refund of any amounts already paid.
          </p>

          <h2 className="font-bold">4. Processing Time for Refunds</h2>
          <p>
            If a refund is granted under the above conditions, it will be processed within 5-7 working days.
          </p>

          <p>
            For any questions or concerns regarding refunds, please contact us at:
          </p>
          <address>
            Ace Software Solutions Pvt Ltd<br />
            No. 19/9, Brindhavan Apartments, Flat - B, Tamilar Street,<br />
            Choolaimedu, Chennai, Tamil Nadu 600094, India.<br />
            <a href="mailto:marketing@acesoft.in">marketing@acesoft.in</a>
          </address>
        </div>
      </div>
      <div className="flex justify-center mt-6">
        <button
          onClick={() => navigate("/subscription")}
          className="bg-indigo-500 text-white px-6 py-2 rounded-lg hover:bg-indigo-600 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};
