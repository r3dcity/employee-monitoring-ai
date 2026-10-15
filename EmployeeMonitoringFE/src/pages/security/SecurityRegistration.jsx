import { useSearchParams } from "react-router";
import axios from "axios";
import { SERVER_URL } from "../../utils/constants";
import { useState, useEffect } from "react";
import background from "../../assets/imgs/login1bg.png";
import LogoName from "../../components/LogoComponent";
import { useNavigate } from "react-router";

const SecurityRegistration = () => {
    const [searchParams] = useSearchParams();
    const code = searchParams.get("code");
    const navigate = useNavigate();
    const [inviterEmail, setInviterEmail] = useState("");
    const [organization, setOrganization] = useState("");
    const [error, setError] = useState("");

    const [emailInput, setEmailInput] = useState("");
    const [passwordInput, setPasswordInput] = useState("");
    const [phoneInput, setPhoneInput] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!code) {
                setError("Invitation code is missing.");
                return;
            }
            try {
                const response = await axios.get(`${SERVER_URL}/users/whoinvitedme`, {
                    params: { code }
                });
                if (response.status === 200) {
                    setInviterEmail(response.data.user.email);
                    setOrganization(response.data.organization.name);
                    setError("");
                } else {
                    setError(`Failed to fetch invitation details: Status ${response.status}`);
                }
            } catch (err) {
                console.error("Error fetching invitation details:", err);
                setError(err.response?.data?.message || "An error occurred while fetching invitation details.");
            }
        };

        fetchData();
    }, [code]);


    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        const registrationData = {
            email: emailInput,
            password: passwordInput,
            phoneNumber: phoneInput,
            invitationCode: code
        };

        try {
            const res = await axios.post(`${SERVER_URL}/users/security/register`, registrationData, {
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (res.status === 201) {
                navigate("/login")
            } else {
                setError(`Registration failed: Status ${res.status}`);
            }

        } catch (err) {
            console.error("Registration error:", err);
            setError(err.response?.data?.message || "An error occurred during registration.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                backgroundImage: `url(${background})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
            className="w-screen h-screen flex items-center justify-center relative overflow-hidden text-white"
        >
            <div className="bg-neutral-600 w-96 p-6 flex flex-col items-center justify-center rounded-lg shadow-lg min-h-[60vh]">
                 <LogoName />

                <h1 className="text-xl font-bold mb-4 mt-6 text-neutral-200">Security Guard Registration</h1>
                {error ? (
                    <p className="text-red-500 text-xs mb-4">{error}</p>
                ) : code ? (
                    <>
                        <p className="mb-1 text-lg font-bold text-neutral-100 text-center">
                            {organization || "Loading Organization..."}
                        </p>
                        <p className="mb-4 text-xs text-neutral-400 text-center">
                            Invited by: {inviterEmail || "Loading..."}
                        </p>

                        <form onSubmit={handleFormSubmit} className="w-full max-w-sm">
                            <div className="mb-4">
                                <label className="block text-neutral-200 text-sm font-bold mb-2" htmlFor="email">
                                    Email
                                </label>
                                <input
                                    className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800 focus:border-blue-500"
                                    id="email"
                                    type="email"
                                    placeholder="your.email@example.com"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-neutral-200 text-sm font-bold mb-2" htmlFor="password">
                                    Password
                                </label>
                                <input
                                    className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800 focus:border-blue-500"
                                    id="password"
                                    type="password"
                                    placeholder="******************"
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    required
                                />
                            </div>
                             <div className="mb-6">
                                <label className="block text-neutral-200 text-sm font-bold mb-2" htmlFor="phone">
                                    Phone Number
                                </label>
                                <input
                                    className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800 focus:border-blue-500"
                                    id="phone"
                                    type="tel"
                                    placeholder="e.g., +1234567890"
                                    value={phoneInput}
                                    onChange={(e) => setPhoneInput(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <button
                                    className="bg-neutral-900 text-neutral-200 w-full mt-4 p-2 rounded hover:bg-neutral-800 hover:cursor-pointer disabled:opacity-50"
                                    type="submit"
                                    disabled={loading || !inviterEmail || !organization}
                                >
                                    {loading ? "Registering..." : "Register"}
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                     <p className="text-yellow-400 text-sm">No invitation code found or code is invalid.</p>
                )}
                 {!code && !error && <p className="text-red-500 text-xs mt-4">Invitation code is missing from the URL.</p>}
            </div>

        </div>
    );
};

export default SecurityRegistration;