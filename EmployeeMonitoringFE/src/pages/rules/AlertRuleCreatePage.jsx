import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import Sidebar from "../../components/layout/Sidebar";
import {
  createAlertRule,
  getCamerasList,
  getZonesList,
  getAllEmployees,
} from "../../services/MainService";
import { FiSave, FiX, FiPlus, FiTrash } from "react-icons/fi";

const AlertRuleForm = ({ onSubmit, navigate, initialData = {}, loading }) => {
  const [description, setDescription] = useState(initialData.description || "");
  const [priority, setPriority] = useState(initialData.priority || "medium");
  const [cooldownSeconds, setCooldownSeconds] = useState(
    initialData.cooldown_seconds || 0
  );
  const [cameraIds, setCameraIds] = useState(
    initialData.location?.cameras?.join(", ") || ""
  );
  const [zoneIds, setZoneIds] = useState(
    initialData.location?.zones?.join(", ") || ""
  );
  const [conditionsJson, setConditionsJson] = useState(
    typeof initialData.conditions_json === "string"
      ? initialData.conditions_json
      : JSON.stringify({ logical_operator: "AND", conditions: [] }, null, 2)
  );
  const [fetchError, setFetchError] = useState(null);

  const [availableCameras, setAvailableCameras] = useState([]);
  const [availableZones, setAvailableZones] = useState([]);
  const [availableEmployees, setAvailableEmployees] = useState([]);

  const [logicalOperator, setLogicalOperator] = useState("AND");
  const [conditions, setConditions] = useState([]);
  const [selectedCameras, setSelectedCameras] = useState([]);
  const [selectedZones, setSelectedZones] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const camerasResponse = await getCamerasList();
        setAvailableCameras(camerasResponse.data.cameras || []);

        const zonesResponse = await getZonesList();
        setAvailableZones(zonesResponse.data.zones || []);

        const employeesResponse = await getAllEmployees();
        setAvailableEmployees(employeesResponse.data || []);
      } catch (error) {
        console.error("Error fetching data:", error);
        setFetchError("Failed to load cameras, zones, or employees data.");
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (initialData.conditions_json) {
      try {
        const parsedConditions =
          typeof initialData.conditions_json === "string"
            ? JSON.parse(initialData.conditions_json)
            : initialData.conditions_json;

        setLogicalOperator(
          parsedConditions.logical_operator || parsedConditions.logic || "AND"
        );
        setConditions(parsedConditions.conditions || []);
      } catch (e) {
        console.error("Failed to parse initial conditions:", e);
      }
    }

    if (initialData.cameras) {
      setSelectedCameras(
        Array.isArray(initialData.cameras) ? initialData.cameras : []
      );
    }

    if (initialData.zones) {
      setSelectedZones(
        Array.isArray(initialData.zones) ? initialData.zones : []
      );
    }
  }, [initialData]);

  useEffect(() => {
    const conditionsObject = {
      logical_operator: logicalOperator,
      conditions: conditions,
    };
    setConditionsJson(JSON.stringify(conditionsObject, null, 2));
  }, [logicalOperator, conditions]);

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        type: "object_detected",
        object_name: "Person",
        count: 1,
        operator: ">",
        dwell_time: 0,
      },
    ]);
  };

  const removeCondition = (index) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index, field, value) => {
    const updatedConditions = [...conditions];

    // Handle special case for face recognition type change
    if (field === "type" && value === "face_recognition") {
      updatedConditions[index] = {
        ...updatedConditions[index],
        [field]: value,
        // Initialize with empty employee_ids array for multiple selection
        employee_ids: [],
        dwell_time: updatedConditions[index].dwell_time || 0,
      };
    }
    // Handle employee toggle for face recognition
    else if (
      field === "toggle_employee" &&
      updatedConditions[index].type === "face_recognition"
    ) {
      // Toggle the employee in a copy of the condition
      const employeeIds = updatedConditions[index].employee_ids || [];
      updatedConditions[index] = {
        ...updatedConditions[index],
        employee_ids: employeeIds.includes(value)
          ? employeeIds.filter((id) => id !== value)
          : [...employeeIds, value],
      };
    }
    // Handle changing from face recognition to another type
    else if (
      field === "type" &&
      updatedConditions[index].type === "face_recognition"
    ) {
      // eslint-disable-next-line no-unused-vars
      const { employee_ids, ...rest } = updatedConditions[index];
      updatedConditions[index] = {
        ...rest,
        [field]: value,
        object_name: "Person",
      };
    }
    // Regular field update
    else {
      updatedConditions[index] = {
        ...updatedConditions[index],
        [field]: value,
      };
    }

    setConditions(updatedConditions);
  };

  const toggleCamera = (cameraId) => {
    if (selectedCameras.includes(cameraId)) {
      setSelectedCameras(selectedCameras.filter((id) => id !== cameraId));
    } else {
      setSelectedCameras([...selectedCameras, cameraId]);
    }
  };

  const toggleZone = (zoneId) => {
    if (selectedZones.includes(zoneId)) {
      setSelectedZones(selectedZones.filter((id) => id !== zoneId));
    } else {
      setSelectedZones([...selectedZones, zoneId]);
    }
  };

  useEffect(() => {
    setCameraIds(selectedCameras.join(", "));
  }, [selectedCameras]);

  useEffect(() => {
    setZoneIds(selectedZones.join(", "));
  }, [selectedZones]);

  const handleSubmit = (e) => {
    e.preventDefault();
    try {
      const parsedConditions = JSON.parse(conditionsJson);
      const ruleData = {
        description,
        priority,
        cooldown_seconds: cooldownSeconds,
        conditions_json: parsedConditions,
        location: {
          cameras: selectedCameras,
          zones: selectedZones,
        },
        is_active: initialData.is_active ?? true,
      };
      onSubmit(ruleData);
    } catch (error) {
      alert("Invalid JSON format in Conditions JSON.");
      console.error("JSON Parsing Error:", error);
    }
  };

  const ppeObjectTypes = [
    { value: "Person", label: "Person" },
    { value: "Hardhat", label: "Hard Hat" },
    { value: "Gloves", label: "Gloves" },
    { value: "Mask", label: "Mask" },
    { value: "Safety Vest", label: "Safety Vest" },
    { value: "Excavator", label: "Excavator" },
    { value: "Ladder", label: "Ladder" },
    { value: "NO-Hardhat", label: "Missing Hard Hat" },
    { value: "NO-Mask", label: "Missing Mask" },
    { value: "NO-Safety Vest", label: "Missing Safety Vest" },
  ];

  const vehicleObjectTypes = [
    { value: "vehicle", label: "Vehicle (generic)" },
    { value: "SUV", label: "SUV" },
    { value: "bus", label: "Bus" },
    { value: "dump truck", label: "Dump Truck" },
    { value: "semi", label: "Semi" },
    { value: "trailer", label: "Trailer" },
    { value: "truck", label: "Truck" },
    { value: "mini-van", label: "Mini-van" },
    { value: "sedan", label: "Sedan" },
    { value: "van", label: "Van" },
  ];

  const conditionTypes = [
    { value: "object_detected", label: "Object Detected" },
    { value: "face_recognition", label: "Face Recognition" },
    { value: "zone_entered", label: "Zone Entered" },
    { value: "zone_exited", label: "Zone Exited" },
    { value: "time_in_zone", label: "Time in Zone" },
  ];

  const operators = [
    { value: ">", label: "Greater than" },
    { value: "<", label: "Less than" },
    { value: "=", label: "Equal to" },
    { value: ">=", label: "Greater than or equal to" },
    { value: "<=", label: "Less than or equal to" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {fetchError && (
        <div
          className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {fetchError}</span>
        </div>
      )}

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-neutral-300 mb-1"
        >
          Description *
        </label>
        <input
          type="text"
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>

      <div>
        <label
          htmlFor="priority"
          className="block text-sm font-medium text-neutral-300 mb-1"
        >
          Priority *
        </label>
        <select
          id="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          required
          className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="cooldownSeconds"
          className="block text-sm font-medium text-neutral-300 mb-1"
        >
          Alert Cooldown (seconds)
        </label>
        <input
          type="number"
          id="cooldownSeconds"
          min="0"
          value={cooldownSeconds}
          onChange={(e) => setCooldownSeconds(parseInt(e.target.value) || 0)}
          className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <p className="mt-1 text-xs text-neutral-400">
          Minimum time between repeated alerts for this rule (0 = no cooldown)
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="block text-sm font-medium text-neutral-300">
            Conditions *
          </label>
          <button
            type="button"
            onClick={addCondition}
            className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-sm flex items-center"
          >
            <FiPlus className="mr-1" /> Add Condition
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-300 mb-1">
            Match
          </label>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="AND"
                checked={logicalOperator === "AND"}
                onChange={() => setLogicalOperator("AND")}
                className="text-cyan-500"
              />
              <span className="ml-2">ALL conditions (AND)</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="OR"
                checked={logicalOperator === "OR"}
                onChange={() => setLogicalOperator("OR")}
                className="text-cyan-500"
              />
              <span className="ml-2">ANY condition (OR)</span>
            </label>
          </div>
        </div>

        <div className="space-y-4">
          {conditions.length === 0 ? (
            <div className="text-neutral-400 text-center py-4 border border-dashed border-neutral-600 rounded">
              No conditions added. Click "Add Condition" to create one.
            </div>
          ) : (
            conditions.map((condition, index) => (
              <div
                key={index}
                className="p-3 bg-neutral-700 rounded border border-neutral-600"
              >
                <div className="flex justify-between mb-2">
                  <h4 className="text-sm font-medium">Condition {index + 1}</h4>
                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    className="text-neutral-400 hover:text-red-500"
                  >
                    <FiTrash size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Type
                    </label>
                    <select
                      value={condition.type}
                      onChange={(e) =>
                        updateCondition(index, "type", e.target.value)
                      }
                      className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                    >
                      {conditionTypes.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {condition.type === "face_recognition" && (
                      <>
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Employees
                          </label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-800 rounded border border-neutral-600">
                            {availableEmployees.map((employee) => (
                              <label
                                key={employee.id}
                                className="flex items-center space-x-2 p-1 hover:bg-neutral-700 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    condition.employee_ids?.includes(
                                      employee.id
                                    ) || false
                                  }
                                  onChange={() =>
                                    updateCondition(
                                      index,
                                      "toggle_employee",
                                      employee.id
                                    )
                                  }
                                  className="text-cyan-500 rounded"
                                />
                                <span className="text-sm truncate">
                                  {employee.firstName} {employee.lastName}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Dwell Time (seconds)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={condition.dwell_time || 0}
                            onChange={(e) =>
                              updateCondition(
                                index,
                                "dwell_time",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                          />
                        </div>
                      </>
                    )}

                    {condition.type === "object_detected" && (
                      <>
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Object Type
                          </label>
                          <select
                            value={condition.object_name || "Person"}
                            onChange={(e) =>
                              updateCondition(
                                index,
                                "object_name",
                                e.target.value
                              )
                            }
                            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                          >
                            <optgroup label="PPE & Personnel">
                              {ppeObjectTypes.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Vehicles">
                              {vehicleObjectTypes.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Operator
                          </label>
                          <select
                            value={condition.operator || ">"}
                            onChange={(e) =>
                              updateCondition(index, "operator", e.target.value)
                            }
                            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                          >
                            {operators.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Count
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={condition.count || 0}
                            onChange={(e) =>
                              updateCondition(
                                index,
                                "count",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Dwell Time (seconds)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={condition.dwell_time || 0}
                            onChange={(e) =>
                              updateCondition(
                                index,
                                "dwell_time",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                          />
                        </div>
                      </>
                    )}

                    {["zone_entered", "zone_exited", "time_in_zone"].includes(
                      condition.type
                    ) && (
                      <>
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Object Type
                          </label>
                          <select
                            value={condition.object_name || "Person"}
                            onChange={(e) =>
                              updateCondition(
                                index,
                                "object_name",
                                e.target.value
                              )
                            }
                            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                          >
                            <optgroup label="PPE & Personnel">
                              {ppeObjectTypes.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Vehicles">
                              {vehicleObjectTypes.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        {condition.type === "time_in_zone" && (
                          <>
                            <div>
                              <label className="block text-xs text-neutral-400 mb-1">
                                Operator
                              </label>
                              <select
                                value={condition.operator || ">"}
                                onChange={(e) =>
                                  updateCondition(
                                    index,
                                    "operator",
                                    e.target.value
                                  )
                                }
                                className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                              >
                                {operators.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-neutral-400 mb-1">
                                Time (seconds)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={condition.seconds || 0}
                                onChange={(e) =>
                                  updateCondition(
                                    index,
                                    "seconds",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
                              />
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <input
          type="hidden"
          id="conditionsJson"
          value={conditionsJson}
          required
        />

        <details className="mt-2">
          <summary className="text-sm text-neutral-400 cursor-pointer">
            Advanced: Edit JSON directly
          </summary>
          <textarea
            value={conditionsJson}
            onChange={(e) => setConditionsJson(e.target.value)}
            rows="6"
            className="w-full mt-2 bg-neutral-800 border border-neutral-600 rounded-md px-3 py-2 text-white font-mono text-xs"
          />
        </details>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Cameras
        </label>
        {availableCameras.length === 0 ? (
          <div className="text-neutral-400 p-2">Loading cameras...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-800 rounded border border-neutral-600">
            {availableCameras.map((camera) => (
              <label
                key={camera.id}
                className="flex items-center space-x-2 p-1 hover:bg-neutral-700 rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedCameras.includes(camera.id)}
                  onChange={() => toggleCamera(camera.id)}
                  className="text-cyan-500 rounded"
                />
                <span className="text-sm truncate" title={camera.name}>
                  {camera.name}
                </span>
              </label>
            ))}
          </div>
        )}
        <input type="hidden" value={cameraIds} />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Zones
        </label>
        {availableZones.length === 0 ? (
          <div className="text-neutral-400 p-2">
            {fetchError ? "Error loading zones" : "Loading zones..."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-800 rounded border border-neutral-600">
            {availableZones.map((zone) => (
              <label
                key={zone.id}
                className="flex items-center space-x-2 p-1 hover:bg-neutral-700 rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedZones.includes(zone.id)}
                  onChange={() => toggleZone(zone.id)}
                  className="text-cyan-500 rounded"
                />
                <span
                  className="text-sm truncate"
                  title={`${zone.name} (Camera: ${zone.cameraName})`}
                >
                  {zone.name} ({zone.cameraName})
                </span>
              </label>
            ))}
          </div>
        )}
        <input type="hidden" value={zoneIds} />
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={() => navigate("/alert-rules")}
          className="px-4 py-2 border border-neutral-600 rounded-md hover:bg-neutral-700 transition-colors"
        >
          <FiX className="inline mr-1" /> Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded inline-flex items-center transition-colors duration-200 disabled:opacity-50"
        >
          <FiSave className="mr-2" />
          {loading ? "Saving..." : "Save Rule"}
        </button>
      </div>
    </form>
  );
};

const AlertRuleCreatePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const handleCreateSubmit = async (ruleData) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (
      !ruleData.location?.cameras?.length &&
      !ruleData.location?.zones?.length
    ) {
      setError("An alert rule must be linked to at least one camera or zone.");
      setLoading(false);
      return;
    }

    try {
      await createAlertRule(ruleData);
      setSuccess(true);
      setError(null);
      setTimeout(() => navigate("/alert-rules"), 1500);
    } catch (err) {
      console.error("Failed to create alert rule:", err);
      setError(
        err.response?.data?.error ||
          "Failed to create rule. Please check inputs."
      );
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold">Create New Alert Rule</h1>
          <button
            onClick={() => navigate("/alert-rules")}
            className="text-neutral-400 hover:text-white"
            title="Back to Alert Rules List"
          >
            <FiX size={24} />
          </button>
        </div>

        {success && (
          <div
            className="bg-green-800 border border-green-600 text-green-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Success!</strong>
            <span className="block sm:inline">
              {" "}
              Alert rule created successfully. Redirecting...
            </span>
          </div>
        )}

        {error && (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        )}

        <div className="bg-neutral-800 rounded-lg shadow-md p-6">
          <AlertRuleForm
            onSubmit={handleCreateSubmit}
            loading={loading}
            navigate={navigate}
          />
        </div>
      </main>
    </div>
  );
};

export default AlertRuleCreatePage;
