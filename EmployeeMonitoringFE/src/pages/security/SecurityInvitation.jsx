import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { postSecurityInvitation, getErrorMessage } from "../../services/MainService";

const SecurityInvitation = () => {
    const [uuid, setUuid] = useState("");
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    const handleGenerate = async () => {
        setCopied(false);
        setError("");
        try {
            const res = await postSecurityInvitation();
            setUuid(res.data.code);
        } catch (err) {
            setUuid("");
            setError(getErrorMessage(err, "Failed to generate invitation code. Please try again."));
        }
    };

    const invitationLink = uuid
        ? `${window.location.origin}/security/register?code=${encodeURIComponent(uuid)}`
        : "";

    const handleCopy = () => {
        if (invitationLink) {
            navigator.clipboard.writeText(invitationLink);
            setCopied(true);
        }
    };

    return (
        <div className="flex h-full bg-neutral-900 text-white">
            <div className="flex flex-col items-center justify-center flex-1">
                <div className="bg-neutral-800 rounded-lg shadow-lg p-8 w-full max-w-2xl flex flex-col items-center">
                    <div className="mb-4 text-center">
                        <p className="text-lg font-semibold">Invite a new security guard securely</p>
                        <p className="text-sm text-neutral-400 mt-2">
                            Click the button below to generate a unique invitation code.
                            <br />
                            After that, share the link with the security guard.
                            Then he will be able to register in the system.
                        </p>
                    </div>
                    <button
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition mb-4"
                        onClick={handleGenerate}
                    >
                        Generate
                    </button>
                    <div className="mt-2 w-full flex items-center gap-2">
                        <div className="relative w-full">
                            <input
                                type="text"
                                value={invitationLink}
                                readOnly
                                onClick={invitationLink ? handleCopy : undefined}
                                className={`w-full bg-neutral-700 ${invitationLink ? (copied ? "text-green-400" : "text-blue-400 cursor-pointer") : "text-neutral-500 cursor-default"} font-mono text-sm px-3 py-2 rounded outline-none pr-10 transition-colors`}
                                style={{ minHeight: "24px" }}
                                title={invitationLink ? "Click to copy" : ""}
                            />
                            {invitationLink && (
                                <span
                                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center"
                                    style={{ pointerEvents: "none" }}
                                >
                                    {copied ? (
                                        <FiCheck size={20} color="#22c55e" />
                                    ) : (
                                        <FiCopy size={20} color="#60a5fa" />
                                    )}
                                </span>
                            )}

                        </div>
                    </div>
                    {error && (
                        <div className="w-full mt-2 text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}
                    <span className="text-blue-400 mt-6">Note: The code is valid for 24 hours.</span>
                </div>
            </div>
        </div>
    );
}

export default SecurityInvitation;