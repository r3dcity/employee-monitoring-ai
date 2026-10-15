import React from 'react';
import { Link, useNavigate } from 'react-router';
import { FiPlus, FiRefreshCw } from 'react-icons/fi';
import VideoCameraFeed from '../../components/video/VideoCameraFeed';
import { useCameras } from '../../services/queries';

const VideoCamerasPage = () => {
    const { data: cameras = [], isLoading: loading, isFetching: refreshing, error, refetch } = useCameras();
    const navigate = useNavigate();

    const handleCameraClick = (camera) => {
        navigate(`/video-cameras/${camera.id}`);
    };

    const handleRefresh = () => refetch();

    return (
        <div className="flex h-full bg-neutral-900 text-white">
            <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6 overflow-y-auto">
                {/* Header and Add Button */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-semibold">Video Cameras</h1>
                    <div className="flex space-x-4">
                        <Link
                            to="/video-cameras/register"
                            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
                        >
                            <FiPlus className="mr-2" />
                            Add New Camera
                        </Link>
                        <button
                            onClick={handleRefresh}
                            className="bg-neutral-600 hover:bg-neutral-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
                        >
                            <FiRefreshCw className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Loading State */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="text-xl text-neutral-400">Loading cameras...</div>
                    </div>
                /* Error State */
                ) : error ? (
                    <div className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6" role="alert">
                        <strong className="font-bold">Error:</strong>
                        <span className="block sm:inline"> Failed to load camera list. Please try again later.</span>
                    </div>
                /* No Cameras Found */
                ) : cameras.length === 0 ? (
                     <div className="text-center py-10 text-neutral-500">
                        No cameras found or available. Start by adding a new camera.
                    </div>
                /* Cameras Grid */
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {cameras.map((camera) => (
                            <VideoCameraFeed
                                key={camera.id}
                                camera={camera}
                                detailed={true}
                                onClickHandler={handleCameraClick}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

export default VideoCamerasPage;