import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { useUser } from "../../context/UserContext";
import { FiPlus, FiShield, FiEdit, FiTrash, FiX } from "react-icons/fi";
import { getAllSecurity, deleteSecurity } from "../../services/MainService";

const SecurityList = () => {
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [personToDelete, setPersonToDelete] = useState(null);
  const { token } = useUser();

  useEffect(() => {
    const fetchPersonnel = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getAllSecurity();
        setPersonnel(response.data || []);
      } catch (err) {
        console.error("Failed to fetch security personnel:", err);
        setError("Failed to load security personnel. Please try again later.");
        setPersonnel([]);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchPersonnel();
    } else {
      setError("Authentication token not found. Please log in.");
      setLoading(false);
    }
  }, [token]);

  const handleDeleteClick = (person) => {
    setPersonToDelete(person);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!personToDelete) return;

    try {
      const res = await deleteSecurity(personToDelete.id);
      if (res.status !== 200) {
        throw new Error("Failed to delete security personnel");
      }
      setPersonnel(personnel.filter((p) => p.id !== personToDelete.id));
      setShowDeleteModal(false);
      setPersonToDelete(null);
    } catch (err) {
      console.error("Failed to delete security person:", err);
      setError("Failed to delete. Please try again.");
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setPersonToDelete(null);
  };

  // Component for statistics card
  const StatCard = ({ icon, title, value }) => (
    <div className="bg-neutral-800 p-5 rounded-lg shadow-md flex items-center">
      <div className="bg-cyan-700 p-3 rounded-md mr-4">{icon}</div>
      <div className="flex-1">
        <span className="text-lg font-semibold block">{title}</span>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );

  const DeleteModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Confirm Deletion</h3>
          <button
            onClick={handleDeleteCancel}
            className="text-neutral-400 hover:text-white"
          >
            <FiX size={24} />
          </button>
        </div>
        <p className="mb-6">
          Are you sure you want to delete security personnel{" "}
          <span className="font-semibold">
            {personToDelete?.firstName} {personToDelete?.lastName}
          </span>
          ? This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleDeleteCancel}
            className="cursor-pointer px-4 py-2 border border-neutral-600 rounded-md hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteConfirm}
            className="cursor-pointer px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-neutral-900 text-white">
      <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6  overflow-y-auto">
        {/* Header and Add Button */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold">Security Personnel</h1>
          <Link
            to="/security/invitation"
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
          >
            <FiPlus className="mr-2" />
            Add Security Personnel
          </Link>
        </div>

        {/* Single Stat Card */}
        <div className="mb-8 max-w-xs">
          <StatCard
            icon={<FiShield className="h-6 w-6 text-white" />}
            title="Total Security Personnel"
            value={personnel.length}
          />
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-neutral-400">
              Loading security personnel...
            </div>
          </div>
        ) : /* Error State */
        error ? (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : /* No Security Personnel Found */
        personnel.length === 0 ? (
          <div className="text-center py-10 text-neutral-500">
            No security personnel found. Click "Add Security Personnel" to add
            one.
          </div>
        ) : (
          /* Security Personnel Table */
          <div className="bg-neutral-800 rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left table-auto">
                <thead className="bg-neutral-700 text-neutral-200">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {personnel.map((person) => (
                    <tr
                      key={person.id}
                      className="border-b border-neutral-700 hover:bg-neutral-700/50 transition-colors"
                    >
                      <td className="px-4 py-3">{`${person.email}`}</td>
                      <td className="px-4 py-3">{person.phoneNumber}</td>
                      <td className="px-4 py-3">TODO</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-start">
                          <Link
                            to={`/security/${person.id}/edit`}
                            className="text-neutral-400 hover:text-white p-1"
                          >
                            <FiEdit size={18} />
                          </Link>
                          <button
                            onClick={() => handleDeleteClick(person)}
                            className="cursor-pointer text-neutral-400 hover:text-red-500 p-1"
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

        {/* Delete Confirmation Modal */}
        {showDeleteModal && <DeleteModal />}
      </main>
    </div>
  );
};

export default SecurityList;
