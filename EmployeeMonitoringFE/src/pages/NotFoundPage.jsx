import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useUser } from "../context/UserContext";

const NotFoundPage = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useUser();
    const loggedIn = isAuthenticated();

    useEffect(() => {
        const timer = setTimeout(() => {
            navigate(loggedIn ? "/dashboard" : "/login", { replace: true });
        }, 5000);
        return () => clearTimeout(timer);
    }, [loggedIn, navigate]);

    return <div
    style={{
        backgroundColor: "#2C2C2C",
        backgroundSize: "cover",
        backgroundPosition: "center",
        width: "100vw",
        height: "100vh",

    }}
    className="flex items-center justify-center h-screen relative"
>
    <div className="text-white">
        <p>404 Page not found</p>
        <p>You will be redirected to home page in a few seconds...</p>

    </div>
</div>
}

export default NotFoundPage;