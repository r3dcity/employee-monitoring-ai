import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import Sidebar from "../../components/layout/Sidebar";
import { createVideoCamera } from '../../services/MainService';
import { FiSave, FiX } from 'react-icons/fi';

const VideoCamerasRegisterPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        ip: '',
        port: '',
        username: '',
        password: '',
        location: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            // Validate form data
            const { name, ip, port, username, password } = formData;
            
            if (!name || !ip || !port || !username || !password) {
                throw new Error("Please fill all required fields.");
            }
            
            // Convert port to number
            const portNumber = parseInt(port, 10);
            if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
                throw new Error("Port must be a valid number between 1 and 65535.");
            }

            // Submit data to API
            await createVideoCamera({
                ...formData,
                port: portNumber
            });

            setSuccess(true);
            // Reset form after successful submission
            setFormData({
                name: '',
                ip: '',
                port: '',
                username: '',
                password: '',
                location: ''
            });

            // Redirect after a short delay to show success message
            setTimeout(() => {
                navigate('/video-cameras');
            }, 2000);
        } catch (err) {
            console.error("Failed to register camera:", err);
            setError(err.response?.data?.message || err.message || "Failed to register camera. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen bg-neutral-900 text-white">
            <Sidebar />
            <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-semibold">Register New Camera</h1>
                    <button
                        onClick={() => navigate('/video-cameras')}
                        className="bg-neutral-700 hover:bg-neutral-600 text-white font-medium py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
                    >
                        <FiX className="mr-2" />
                        Cancel
                    </button>
                </div>

                {/* Success message */}
                {success && (
                    <div className="bg-green-800 border border-green-600 text-green-100 px-4 py-3 rounded relative mb-6" role="alert">
                        <strong className="font-bold">Success!</strong>
                        <span className="block sm:inline"> Camera registered successfully. Redirecting...</span>
                    </div>
                )}

                {/* Error message */}
                {error && (
                    <div className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6" role="alert">
                        <strong className="font-bold">Error:</strong>
                        <span className="block sm:inline"> {error}</span>
                    </div>
                )}

                <div className="bg-neutral-800 rounded-lg shadow-md p-6">
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Camera Name */}
                            <div className="col-span-1">
                                <label htmlFor="name" className="block text-sm font-medium text-neutral-300 mb-2">
                                    Camera Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="w-full bg-neutral-700 border border-neutral-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="Main Entrance Camera"
                                    required
                                />
                                <p className="mt-1 text-xs text-neutral-400">Give your camera a unique, descriptive name</p>
                            </div>

                            {/* Camera Location */}
                            <div className="col-span-1">
                                <label htmlFor="location" className="block text-sm font-medium text-neutral-300 mb-2">
                                    Location
                                </label>
                                <input
                                    type="text"
                                    id="location"
                                    name="location"
                                    value={formData.location}
                                    onChange={handleChange}
                                    className="w-full bg-neutral-700 border border-neutral-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="Building A, Front Entrance"
                                />
                                <p className="mt-1 text-xs text-neutral-400">Physical location of the camera</p>
                            </div>

                            {/* IP Address */}
                            <div className="col-span-1">
                                <label htmlFor="ip" className="block text-sm font-medium text-neutral-300 mb-2">
                                    IP Address <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="ip"
                                    name="ip"
                                    value={formData.ip}
                                    onChange={handleChange}
                                    className="w-full bg-neutral-700 border border-neutral-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="192.168.1.100"
                                    required
                                />
                                <p className="mt-1 text-xs text-neutral-400">IP address of the camera on your network</p>
                            </div>

                            {/* Port */}
                            <div className="col-span-1">
                                <label htmlFor="port" className="block text-sm font-medium text-neutral-300 mb-2">
                                    Port <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    id="port"
                                    name="port"
                                    value={formData.port}
                                    onChange={handleChange}
                                    className="w-full bg-neutral-700 border border-neutral-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="554"
                                    min="1"
                                    max="65535"
                                    required
                                />
                                <p className="mt-1 text-xs text-neutral-400">Default RTSP port is typically 554</p>
                            </div>

                            {/* Username */}
                            <div className="col-span-1">
                                <label htmlFor="username" className="block text-sm font-medium text-neutral-300 mb-2">
                                    Username <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    className="w-full bg-neutral-700 border border-neutral-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="admin"
                                    required
                                />
                                <p className="mt-1 text-xs text-neutral-400">Camera login username</p>
                            </div>

                            {/* Password */}
                            <div className="col-span-1">
                                <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-2">
                                    Password <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="w-full bg-neutral-700 border border-neutral-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="••••••••"
                                    required
                                />
                                <p className="mt-1 text-xs text-neutral-400">Camera login password</p>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="mt-8">
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded flex items-center justify-center transition-colors duration-200 disabled:bg-neutral-600 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <span>Registering...</span>
                                ) : (
                                    <>
                                        <FiSave className="mr-2" />
                                        Register Camera
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
                
                {/* Info Box */}
                <div className="mt-6 bg-neutral-800 rounded-lg shadow-md p-6 border-l-4 border-cyan-500">
                    <h3 className="text-lg font-semibold mb-2">Camera Information</h3>
                    <p className="text-neutral-300 text-sm mb-4">
                        To connect your camera, you'll need its network information including IP address, port, username, and password.
                        This information is typically available in your camera's documentation or from your network administrator.
                    </p>
                    <h4 className="font-medium text-neutral-200 mb-1">Common RTSP Port Numbers:</h4>
                    <ul className="list-disc list-inside text-sm text-neutral-400 space-y-1 ml-2">
                        <li>Standard RTSP: 554</li>
                        <li>Hikvision: 554</li>
                        <li>Dahua: 554 or 37777</li>
                        <li>Axis: 554</li>
                    </ul>
                </div>
            </main>
        </div>
    );
};

export default VideoCamerasRegisterPage;