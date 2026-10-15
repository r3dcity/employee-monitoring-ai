import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { registerEmployee } from '../../services/MainService';
import { FiUser, FiUpload, FiSave } from 'react-icons/fi';

const EmployeeRegistration = () => {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phoneNumber: '',
        department: '',
        role: ''
    });
    const [photo, setPhoto] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

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
        setLoading(true);
        setError(null);

        try {
            // Create FormData object to send file and form data
            const submitData = new FormData();
            // Add all text fields
            Object.keys(formData).forEach(key => {
                submitData.append(key, formData[key]);
            });

            // Add the photo - it's mandatory
            if (photo) {
                submitData.append('profile-picture', photo);
            } else {
                setError("Profile picture is required");
                setLoading(false);
                return;
            }

            // Send the registration request
            await registerEmployee(submitData);

            // Redirect to employees list on success
            navigate('/employees');
        } catch (err) {
            console.error("Failed to register employee:", err);
            setError(
                err.response?.data?.message ||
                "Failed to register employee. Please check your inputs and try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-full bg-neutral-900 text-white">
            <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-semibold">Register New Employee</h1>
                </div>

                {/* Registration Form */}
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
                                {previewUrl ? (
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
                                Upload Photo (Required)
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handlePhotoChange}
                                    required
                                />
                            </label>
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
                                disabled={loading}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded inline-flex items-center transition-colors duration-200"
                            >
                                <FiSave className="mr-2" />
                                {loading ? 'Saving...' : 'Save Employee'}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}

export default EmployeeRegistration;