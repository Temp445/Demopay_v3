import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Visitor = {
  id: string;
  photo: string;
  total_visits: number;
  created_at: string;
};

type VisitorTimestamp = {
  id: string;
  entry: "IN" | "OUT";
  timestamp: string;
};

export default function VisitorCapturesPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [visitorHistory, setVisitorHistory] = useState<VisitorTimestamp[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 🔹 BYTEA → Image URL
  const byteaToImageUrl = (bytea: string) => {
    try {
      const hex = bytea.startsWith("\\x") ? bytea.slice(2) : bytea;
      let jsonStr = "";
      for (let i = 0; i < hex.length; i += 2) {
        jsonStr += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
      }
      const byteObj = JSON.parse(jsonStr);
      const byteArray = new Uint8Array(Object.values(byteObj));
      const blob = new Blob([byteArray], { type: "image/jpeg" });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("Image decode failed", err);
      return "";
    }
  };

  // Fetch all visitors
  useEffect(() => {
    const fetchVisitors = async () => {
      const { data, error } = await supabase
        .from("attendance_visitor")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setVisitors(data || []);
      }

      setLoading(false);
    };

    fetchVisitors();
  }, []);

  // Fetch selected visitor's history
  const fetchVisitorHistory = async (visitor: Visitor) => {
    setHistoryLoading(true);
    setSelectedVisitor(visitor);

    const { data, error } = await supabase
      .from("attendance_visitor_timestamp")
      .select("id, entry, timestamp")
      .eq("visitor_id", visitor.id)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error(error);
      setVisitorHistory([]);
    } else {
      setVisitorHistory(data || []);
    }

    setHistoryLoading(false);
  };

  if (loading) {
    return <p className="text-center">Loading visitors...</p>;
  }

  if (visitors.length === 0) {
    return <p className="text-center">No visitor captures found</p>;
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Visitor Captures</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {visitors.map((visitor) => {
          const imgUrl = byteaToImageUrl(visitor.photo);
          return (
            <div
              key={visitor.id}
              className="border rounded-lg shadow-sm p-2 cursor-pointer"
              onClick={() => fetchVisitorHistory(visitor)}
            >
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt="Visitor"
                  className="w-full h-40 object-cover rounded"
                />
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-gray-200 rounded">
                  Image Error
                </div>
              )}

              <div className="mt-2 text-sm">
                <p>
                  <b>Visits:</b> {visitor.total_visits}
                </p>
                <p className="text-gray-500">
                  {new Date(visitor.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Overlay */}
      {selectedVisitor && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm p-4"
          onClick={() => setSelectedVisitor(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] shadow-2xl relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 transition text-lg"
              onClick={() => setSelectedVisitor(null)}
            >
              ✕
            </button>

            {/* Header */}
            <div className="px-6 pt-6">
              <h3 className="text-2xl font-bold mb-4 text-center text-gray-800">
                Visitor History
              </h3>

              {/* Visitor Photo */}
              <div className="flex justify-center mb-4">
                <img
                  src={byteaToImageUrl(selectedVisitor.photo)}
                  alt="Visitor"
                  className="w-28 h-28 object-cover rounded-full shadow-lg"
                />
              </div>

              {/* Total Visits */}
              <p className="text-center mb-4 text-gray-600">
                <b>Total Visits:</b> {selectedVisitor.total_visits}
              </p>
            </div>

            {/* Scrollable History List */}
            <div className="px-6 flex-1 overflow-y-auto">
              {historyLoading ? (
                <p className="text-center text-gray-500">Loading history...</p>
              ) : visitorHistory.length === 0 ? (
                <p className="text-center text-gray-500">No history found</p>
              ) : (
                <ul className="space-y-2 pb-4">
                  {visitorHistory.map((record) => (
                    <li
                      key={record.id}
                      className="flex justify-between items-center bg-gray-50 rounded-xl p-3 shadow-sm hover:bg-gray-100 transition"
                    >
                      <span
                        className={`text-sm ${
                          record.entry === "IN"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {record.entry}
                      </span>
                      <span className="text-gray-500 text-sm">
                        {new Date(record.timestamp).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
