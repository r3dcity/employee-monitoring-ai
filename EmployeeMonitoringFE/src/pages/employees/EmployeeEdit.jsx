import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getEmployee, updateEmployee } from '../../services/MainService';
import { useUser } from '../../context/UserContext';
import { SERVER_URL } from '../../utils/constants';
import { FiUser, FiUpload, FiSave } from 'react-icons/fi';
import AuthenticatedImage from '../../components/AuthenticatedImage';

const EmployeeEdit = () => {
    const { employeeId } = useParams();
    const navigate = useNavigate();
    const { token } = useUser();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phoneNumber: '',
        department: '',
        role: ''
    });
    const [photo, setPhoto] = useState(null);
    const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    useEffect(() => {
        const fetchEmployeeData = async () => {
            setLoading(true);
            try {
                const response = await getEmployee(employeeId);
                const employee = response.data;

                setFormData({
                    firstName: employee.firstName || '',
                    lastName: employee.lastName || '',
                    phoneNumber: employee.phoneNumber || '',
                    department: employee.department || '',
                    role: employee.role || ''
                });

                if (employee.profilePicture) {
                    setCurrentPhotoUrl(`${SERVER_URL}/employees/${employeeId}/profile-picture`);
                    setPreviewUrl(`${SERVER_URL}/employees/${employeeId}/profile-picture`);
                }

            } catch (err) {
                console.error("Failed to fetch employee:", err);
                setError("Failed to load employee data. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        if (employeeId && token) {
            fetchEmployeeData();
        } else {
            setError("Missing employee ID or authentication.");
            setLoading(false);
        }
    }, [employeeId, token]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhoto(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            // Create FormData object to send file and form data
            const submitData = new FormData();

            // Add all text fields
            Object.keys(formData).forEach(key => {
                submitData.append(key, formData[key]);
            });

            // Add the photo only if a new one was selected
            if (photo) {
                submitData.append('profile-picture', photo);
            }

            // Send the update request
            await updateEmployee(employeeId, submitData);

            // Redirect to employees list on success
            navigate('/employees');
        } catch (err) {
            console.error("Failed to update employee:", err);
            setError(
                err.response?.data?.message ||
                "Failed to update employee. Please check your inputs and try again."
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex h-full bg-neutral-900 text-white">
            <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6  overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-semibold">Edit Employee</h1>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="text-xl text-neutral-400">Loading employee data...</div>
                    </div>
                ) : error ? (
                    <div className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6" role="alert">
                        <strong className="font-bold">Error:</strong>
                        <span className="block sm:inline"> {error}</span>
                    </div>
                ) : (
                    <div className="bg-neutral-800 rounded-lg shadow-md p-6">
                        {error && (
                            <div className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6" role="alert">
                                <strong className="font-bold">Error:</strong>
                                <span className="block sm:inline"> {error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Photo Upload Section */}
                            <div className="flex flex-col items-center justify-center mb-6">
                                <div className="w-32 h-32 rounded-full overflow-hidden bg-neutral-700 flex items-center justify-center mb-4">
                                    {previewUrl && !photo ? (
                                        <AuthenticatedImage
                                            employeeId={employeeId}
                                            alt={`${formData.firstName} ${formData.lastName}`}
                                        />
                                    ) : previewUrl ? (
                                        <img
                                            src={previewUrl}
                                            alt="Employee preview"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <FiUser size={64} className="text-neutral-500" />
                                    )}
                                </div>
                                <label className="cursor-pointer bg-cyan-700 hover:bg-cyan-600 text-white px-4 py-2 rounded-md flex items-center transition-colors">
                                    <FiUpload className="mr-2" />
                                    Upload New Photo
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handlePhotoChange}
                                    />
                                </label>
                                {currentPhotoUrl && !photo && (
                                    <p className="text-sm text-neutral-400 mt-2">
                                        Leave empty to keep the current photo
                                    </p>
                                )}
                            </div>

                            {/* Form Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Personal Info */}
                                <div>
                                    <h3 className="text-xl font-semibold mb-4">Personal Information</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">First Name *</label>
                                            <input
                                                type="text"
                                                name="firstName"
                                                value={formData.firstName}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Last Name *</label>
                                            <input
                                                type="text"
                                                name="lastName"
                                                value={formData.lastName}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Phone Number *</label>
                                            <input
                                                type="tel"
                                                name="phoneNumber"
                                                value={formData.phoneNumber}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Employment Info */}
                                <div>
                                    <h3 className="text-xl font-semibold mb-4">Employment Information</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Department *</label>
                                            <input
                                                type="text"
                                                name="department"
                                                value={formData.department}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Role *</label>
                                            <input
                                                type="text"
                                                name="role"
                                                value={formData.role}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 text-white"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded inline-flex items-center transition-colors duration-200"
                                >
                                    <FiSave className="mr-2" />
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </main>
        </div>
    );
};

export default EmployeeEdit;