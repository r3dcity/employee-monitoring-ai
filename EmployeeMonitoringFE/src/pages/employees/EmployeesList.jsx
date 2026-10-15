import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { getAllEmployees, deleteEmployee } from '../../services/MainService';
import { useUser } from '../../context/UserContext';
import AuthenticatedImage from '../../components/AuthenticatedImage';
import { FiPlus, FiUsers, FiEdit, FiTrash, FiX } from 'react-icons/fi';

const EmployeesList = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState(null);
    const { token } = useUser();
    useEffect(() => {
        const fetchEmployees = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await getAllEmployees();
                const employeeData = response.data || [];
                setEmployees(employeeData);
            } catch (err) {
                console.error("Failed to fetch employees:", err);
                setError("Failed to load employee list. Please try again later.");
                setEmployees([]);
            } finally {
                setLoading(false);
            }
        };

        if (token) {
            fetchEmployees();
        } else {
            setError("Authentication token not found. Please log in.");
            setLoading(false);
        }
    }, [token]);

    const handleDeleteClick = (employee) => {
        setEmployeeToDelete(employee);
        setShowDeleteModal(true);
    };

    const handleDeleteConfirm = async () => {
        if (!employeeToDelete) return;

        try {
            await deleteEmployee(employeeToDelete.id);
            // Update the local state to remove the deleted employee
            setEmployees(employees.filter(emp => emp.id !== employeeToDelete.id));
            setShowDeleteModal(false);
            setEmployeeToDelete(null);
        } catch (err) {
            console.error("Failed to delete employee:", err);
            setError("Failed to delete employee. Please try again.");
        }
    };

    const handleDeleteCancel = () => {
        setShowDeleteModal(false);
        setEmployeeToDelete(null);
    };

    // Component for statistics card
    const StatCard = ({ icon, title, value }) => (
        <div className="bg-neutral-800 p-5 rounded-lg shadow-md flex items-center">
            <div className="bg-cyan-700 p-3 rounded-md mr-4">
                {icon}
            </div>
            <div className="flex-1">
                <span className="text-lg font-semibold block">{title}</span>
                <div className="text-2xl font-bold">{value}</div>
            </div>
        </div>
    );


    const DeleteModal = () => (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">Confirm Deletion</h3>
                    <button onClick={handleDeleteCancel} className="cursor-pointer text-neutral-400 hover:text-white">
                        <FiX size={24} />
                    </button>
                </div>
                <p className="mb-6">
                    Are you sure you want to delete employee <span className="font-semibold">{employeeToDelete?.firstName} {employeeToDelete?.lastName}</span>?
                    This action cannot be undone.
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
                    <h1 className="text-3xl font-semibold">Employees</h1>
                    <Link
                        to="/employees/register"
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
                    >
                        <FiPlus className="mr-2" />
                        Add New Employee
                    </Link>
                </div>

                {/* Single Stat Card - Changed from full width to max-w-xs */}
                <div className="mb-8 max-w-xs">
                    <StatCard
                        icon={<FiUsers className="h-6 w-6 text-white" />}
                        title="Total Employees"
                        value={employees.length}
                    />
                </div>

                {/* Loading State */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="text-xl text-neutral-400">Loading employees...</div>
                    </div>
                /* Error State */
                ) : error ? (
                    <div className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6" role="alert">
                        <strong className="font-bold">Error:</strong>
                        <span className="block sm:inline"> {error}</span>
                    </div>
                /* No Employees Found */
                ) : employees.length === 0 ? (
                     <div className="text-center py-10 text-neutral-500">
                        No employees found. Click "Add New Employee" to add one.
                    </div>
                ) : (
                    /* Employees Table */
                    <div className="bg-neutral-800 rounded-lg shadow-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left table-auto">
                                <thead className="bg-neutral-700 text-neutral-200">
                                    <tr>
                                        <th className="px-4 py-3">Photo</th>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Phone</th>
                                        <th className="px-4 py-3">Department</th>
                                        <th className="px-4 py-3">Position</th>
                                        <th className="px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map((employee) => (
                                        <tr key={employee.id} className="border-b border-neutral-700 hover:bg-neutral-700/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-600">
                                                    {employee.id ? (
                                                        <AuthenticatedImage
                                                            employeeId={employee.id}
                                                            alt={`${employee.firstName} ${employee.lastName}`}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                                            {employee.firstName?.charAt(0)}{employee.lastName?.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">{`${employee.firstName} ${employee.lastName}`}</td>
                                            <td className="px-4 py-3">{employee.phoneNumber}</td>
                                            <td className="px-4 py-3">{employee.department || 'N/A'}</td>
                                            <td className="px-4 py-3">{employee.role || 'N/A'}</td>
                                            <td className="px-4 py-3">

                                                <div className="flex space-x-2">
                                                    <Link
                                                        to={`/employees/${employee.id}/edit`}
                                                        className="text-neutral-400 hover:text-white p-1"
                                                    >
                                                        <FiEdit size={18} />
                                                    </Link>
                                                    <button
                                                        onClick={() => handleDeleteClick(employee)}
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

                {showDeleteModal && <DeleteModal/>}
            </main>
        </div>
    );
}

export default EmployeesList;