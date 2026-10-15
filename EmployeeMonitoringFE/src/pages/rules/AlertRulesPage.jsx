import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import Sidebar from "../../components/layout/Sidebar";
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from "../../services/MainService";
import {
  FiPlus,
  FiEdit,
  FiTrash,
  FiToggleLeft,
  FiToggleRight,
  FiInfo,
  FiX,
} from "react-icons/fi";
import { LoadingComponent } from "../../components/LoadingComponent"; // Assuming you have this

// Basic Modal Component (You might have a more sophisticated one)
const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
      <div className="bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-neutral-400 hover:text-white"
        >
          <FiX size={20} />
        </button>
        {children}
      </div>
    </div>
  );
};

// Simple JSON editor (replace with a proper library if needed)
const JsonEditor = ({ value, onChange, readOnly = false }) => {
  const [textValue, setTextValue] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState("");

  useEffect(() => {
    setTextValue(JSON.stringify(value, null, 2));
    setError(""); // Clear error when value prop changes
  }, [value]);

  const handleChange = (e) => {
    const newText = e.target.value;
    setTextValue(newText);
    try {
      const parsed = JSON.parse(newText);
      onChange(parsed); // Pass parsed JSON up
      setError("");
    } catch {
      setError("Invalid JSON");
    }
  };

  return (
    <div>
      <textarea
        className={`w-full h-40 bg-neutral-700 border ${
          error ? "border-red-500" : "border-neutral-600"
        } rounded-md px-3 py-2 text-white font-mono text-sm`}
        value={textValue}
        onChange={handleChange}
        readOnly={readOnly}
        placeholder="Enter conditions as JSON..."
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

const AlertRulesPage = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState(null); // For editing/creating
  const [formState, setFormState] = useState({
    description: "",
    priority: "medium",
    conditions_json: { conditions: [], logical_operator: "AND" },
    is_active: false,
    location: { cameras: [], zones: [] }, // Assuming structure
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAlertRules();
      setRules(response.data || []);
    } catch (err) {
      console.error("Failed to fetch alert rules:", err);
      setError(err.response?.data?.error || "Failed to load rules.");
    } finally {
      setLoading(false);
    }
  };

  const openModalForCreate = () => {
    navigate("/alert-rules/create");
  };

  const openModalForEdit = (rule) => {
    setCurrentRule(rule); // Set the rule being edited
    setFormState({
      // Populate form with rule data
      description: rule.description || "",
      priority: rule.priority || "medium",
      conditions_json: rule.conditions_json || {
        conditions: [],
        logical_operator: "AND",
      }, // Use parsed JSON
      is_active: rule.is_active,
      location: {
        // Assuming backend returns camera/zone IDs directly
        cameras: rule.cameras || [],
        zones: rule.zones || [],
      },
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentRule(null);
    setError(null); // Clear modal errors
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "cameras" || name === "zones") {
      // Handle comma-separated IDs for cameras/zones
      const idArray = value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id)
        .map(Number);
      setFormState((prev) => ({
        ...prev,
        location: { ...prev.location, [name]: idArray },
      }));
    } else {
      setFormState((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleJsonChange = (jsonData) => {
    setFormState((prev) => ({ ...prev, conditions_json: jsonData }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); // Indicate processing
    setError(null);

    // Basic validation (add more as needed)
    if (!formState.description) {
      setError("Description is required.");
      setLoading(false);
      return;
    }
    if (
      !formState.conditions_json ||
      !formState.conditions_json.conditions ||
      !(formState.conditions_json.logical_operator || formState.conditions_json.logic)
    ) {
      setError(
        "Conditions JSON must be valid and contain 'conditions' and 'logical_operator'."
      );
      setLoading(false);
      return;
    }

    try {
      if (currentRule) {
        // Update existing rule
        await updateAlertRule(currentRule.id, formState);
      } else {
        // Create new rule
        await createAlertRule(formState);
      }
      fetchRules(); // Refresh the list
      closeModal();
    } catch (err) {
      console.error("Failed to save rule:", err);
      setError(err.response?.data?.error || "Failed to save rule.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (ruleId) => {
    if (window.confirm("Are you sure you want to delete this rule?")) {
      setLoading(true); // Indicate processing
      try {
        await deleteAlertRule(ruleId);
        fetchRules(); // Refresh list
      } catch (err) {
        console.error("Failed to delete rule:", err);
        setError(err.response?.data?.error || "Failed to delete rule.");
      } finally {
        setLoading(false);
      }
    }
  };

  const toggleActiveStatus = async (rule) => {
    setLoading(true); // Indicate processing
    try {
      await updateAlertRule(rule.id, { is_active: !rule.is_active });
      fetchRules(); // Refresh list
    } catch (err) {
      console.error("Failed to toggle rule status:", err);
      setError(err.response?.data?.error || "Failed to update status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold">Alert Rules Management</h1>
          <button
            onClick={openModalForCreate}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
          >
            <FiPlus className="mr-2" />
            Create New Rule
          </button>
        </div>

        {/* Loading State */}
        {loading &&
          !isModalOpen && ( // Don't show main loading indicator when modal is open and loading
            <div className="flex justify-center items-center h-64">
              <LoadingComponent />
            </div>
          )}

        {/* Error Display */}
        {error &&
          !isModalOpen && ( // Only show main error if modal isn't open
            <div
              className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
              role="alert"
            >
              <strong className="font-bold">Error:</strong>
              <span className="block sm:inline"> {error}</span>
            </div>
          )}

        {/* Rules Table/List */}
        {!loading && !error && rules.length === 0 && (
          <div className="text-center py-10 text-neutral-500">
            No alert rules found. Click "Create New Rule" to add one.
          </div>
        )}

        {!loading && rules.length > 0 && (
          <div className="bg-neutral-800 rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left table-auto">
                <thead className="bg-neutral-700 text-neutral-200">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Active</th>
                    <th className="px-4 py-3">Cameras</th>
                    <th className="px-4 py-3">Zones</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr
                      key={rule.id}
                      className="border-b border-neutral-700 hover:bg-neutral-700/50 transition-colors"
                    >
                      <td className="px-4 py-3">{rule.description}</td>
                      <td className="px-4 py-3 capitalize">{rule.priority}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActiveStatus(rule)}
                          className={`p-1 rounded ${
                            rule.is_active
                              ? "text-green-400"
                              : "text-neutral-500"
                          }`}
                        >
                          {rule.is_active ? (
                            <FiToggleRight size={22} />
                          ) : (
                            <FiToggleLeft size={22} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {rule.cameras?.join(", ") || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {rule.zones?.join(", ") || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openModalForEdit(rule)}
                            className="text-neutral-400 hover:text-cyan-400 p-1"
                            title="Edit Rule"
                          >
                            <FiEdit size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(rule.id)}
                            className="text-neutral-400 hover:text-red-500 p-1"
                            title="Delete Rule"
                          >
                            <FiTrash size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={closeModal}>
          <h2 className="text-xl font-semibold mb-4">
            {currentRule ? "Edit Alert Rule" : "Create New Alert Rule"}
          </h2>
          {error && ( // Show modal-specific errors
            <div
              className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-4"
              role="alert"
            >
              <strong className="font-bold">Error:</strong>
              <span className="block sm:inline"> {error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="description"
              >
                Description *
              </label>
              <input
                type="text"
                id="description"
                name="description"
                value={formState.description}
                onChange={handleFormChange}
                required
                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="priority"
              >
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                value={formState.priority}
                onChange={handleFormChange}
                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="conditions_json"
              >
                Conditions (JSON) *
              </label>
              <JsonEditor
                value={formState.conditions_json}
                onChange={handleJsonChange}
              />
              <p className="text-xs text-neutral-400 mt-1 flex items-center">
                <FiInfo size={12} className="mr-1" />
                Structure:{" "}
                {`{ "conditions": [...], "logical_operator": "AND" | "OR" }`}
              </p>
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="cameras"
              >
                Camera IDs (comma-separated)
              </label>
              <input
                type="text"
                id="cameras"
                name="cameras"
                value={formState.location.cameras.join(", ")}
                onChange={handleFormChange}
                placeholder="e.g., 1, 5, 10"
                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="zones">
                Zone IDs (comma-separated)
              </label>
              <input
                type="text"
                id="zones"
                name="zones"
                value={formState.location.zones.join(", ")}
                onChange={handleFormChange}
                placeholder="e.g., 2, 3"
                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                checked={formState.is_active}
                onChange={handleFormChange}
                className="h-4 w-4 text-cyan-600 border-neutral-500 rounded focus:ring-cyan-500"
              />
              <label
                htmlFor="is_active"
                className="ml-2 block text-sm text-neutral-300"
              >
                Active
              </label>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="bg-neutral-600 hover:bg-neutral-500 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
              >
                {loading
                  ? "Saving..."
                  : currentRule
                  ? "Save Changes"
                  : "Create Rule"}
              </button>
            </div>
          </form>
        </Modal>
      </main>
    </div>
  );
};

export default AlertRulesPage;
