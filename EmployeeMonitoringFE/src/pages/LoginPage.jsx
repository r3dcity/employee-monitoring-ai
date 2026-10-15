import background from "../assets/imgs/login1bg.png";
import LogoName from "../components/LogoComponent";
import { Link, useNavigate } from "react-router";
import axios from "axios";
import { SERVER_URL } from "../utils/constants";
import { useState } from "react";
import { CiUser } from "react-icons/ci";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../services/MainService";

const LoginPage = () => {
  const [step, setStep] = useState("step1-login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const { login } = useUser()
  const navigate = useNavigate()

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError("")
    const formData = new FormData(e.target);
    const password = formData.get("password");

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${SERVER_URL}/users/login`, {email, password})
      login(res.data["user"], res.data["token"])
      navigate("/dashboard")
    } catch(err) {
      console.error(err);
      setError(getErrorMessage(err, "An error occurred. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(""); // reset error state
    const formData = new FormData(e.target);
    const email = formData.get("email");
    if (!email) {
      setError("Please enter your email.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${SERVER_URL}/users/check-email`, { email });
      setEmail(email)
      if (res.data["exists"]) {
        setStep("step2-login");

      } else {
        setStep("step1-register");
      }
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "An error occurred. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Register = (e) => {
    e.preventDefault();
    setError("")
    const formData = new FormData(e.target);
    const password = formData.get("password");
    const confirmedPassword = formData.get("confirmedPassword")

    if(password == "" || password == null) {
      setError("Please enter your password.")
      return
    }

    if(confirmedPassword == "" || confirmedPassword == null) {
      setError("Please confirm your password.")
      return
    }

    if(password != confirmedPassword) {
      setError("Passwords do not match.")
      return
    }

    if(password.length < 8) {
      setError("Password must be at least 8 characters long.")
      return
    }
    setPassword(password)
    setStep("step2-register")
  }

  const handleStep2Register = async (e) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.target)
    const phoneNumber = formData.get("phoneNumber")
    const organization = formData.get("organization")

    if(phoneNumber == "" || phoneNumber == null) {
      setError("Please enter your phone number.")
      return
    }

    if(organization == "" || organization == null) {
      setError("Please enter your organization name.")
      return
    }

    try {
      setLoading(true)
      const res = await axios.post(`${SERVER_URL}/users/register`, {
        email,
        password,
        phoneNumber,
        organization
      })
      if(res.status === 201) {
        setStep("step3-register")
      }
    } catch(err) {
      console.error(err)
      setError(getErrorMessage(err, "An error occurred. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  const handleStep3Register = async (e) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.target)
    const code = formData.get("code")

    if(code == "" || code == null) {
      setError("Please enter the code.")
      return
    }

    try {
      setLoading(true)
      const res = await axios.post(`${SERVER_URL}/users/verify-email`, {email, code})
      if(res.status !== 200) {
        throw res.data["message"];
      } else if(res.status === 200) {

        const res = await axios.post(`${SERVER_URL}/users/login`, {email, password})
        if(res.status == 200) {
          const data = res.data;
          login(data["user"], data["token"])
          navigate("/dashboard")
        } else {
          setError("Looks like we couldn't log you in. Try again later..")
        }
      }
    } catch(err) {
      console.error(err)
      setError(getErrorMessage(err, "An error occurred. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className="w-screen h-screen flex items-center justify-center relative overflow-hidden"
    >
      <div className="bg-neutral-600 w-80 p-6 flex flex-col items-center justify-center rounded-lg shadow-lg min-h-[55vh]">
        <LogoName />

        {step === "step1-login" && (
          <form onSubmit={handleEmailSubmit} className="w-full">
            <label className="text-neutral-200 mt-8 mb-2 text-sm block">
              Enter your email address
            </label>
            <input
              name="email"
              type="email"
              className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800"
            />
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <button
              type="submit"
              className="bg-neutral-900 text-neutral-200 w-full mt-8 p-2 rounded hover:bg-neutral-800 hover:cursor-pointer"
              disabled={loading}
            >
              {loading ? "Loading..." : "Continue"}
              </button>
            <p className="text-neutral-300 text-xs text-center mt-8">
              Don't worry if you don't have an account
              <br />
              you can create one in the next step
            </p>
          </form>
        )}

        {step === "step2-login" && (<>
          <div className="mt-8 rounded-full w-24 h-24 bg-neutral-200"><CiUser className="w-24 h-22" /></div>
          <p className="text-neutral-300 mt-2">{email}</p>
          <form onSubmit={handlePasswordSubmit} className="w-full">
            <label className="text-neutral-200 mt-8 mb-2 text-sm block">
              Enter your password
            </label>
            <input
              name="password"
              type="password"
              className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800"
            />
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <button
              type="submit"
              className="bg-neutral-900 text-neutral-200 w-full mt-8 p-2 rounded hover:bg-neutral-800 hover:cursor-pointer"
              disabled={loading}
            >
              {loading ? "Loading..." : "Continue"}
            </button>
            <div></div><p className="mt-2 text-right text-neutral-300">Forgot password?</p>
          </form></>
        )}

        {step === "step1-register" && (
          <form onSubmit={handleStep1Register} className="w-full">
            <p className="text-neutral-300 text-xl text-center mt-8">Looks like you are not registered yet...</p>
             <label className="text-neutral-200 mt-8 mb-2 text-sm block">
              Enter your password
            </label>
            <input
              name="password"
              type="password"
              className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800"
            />
             <label className="text-neutral-200 mt-8 mb-2 text-sm block">
              Confirm your password
            </label>
            <input
              name="confirmedPassword"
              type="password"
              className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800"
            />
             <button
              type="submit"
              className="bg-neutral-900 text-neutral-200 w-full mt-8 p-2 rounded hover:bg-neutral-800 hover:cursor-pointer"
              disabled={loading}
            >
              {loading ? "Loading..." : "Continue"}
            </button>
          </form>
        )}

        {step === "step2-register" && (
          <form onSubmit={handleStep2Register} className="w-full">
          <p className="text-neutral-300 text-xl text-center mt-8">Just one more last step...</p>
           <label className="text-neutral-200 mt-8 mb-2 text-sm block">
            Enter your phone number
          </label>
          <input
            name="phoneNumber"
            type="text"
            className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800"
          />
           <label className="text-neutral-200 mt-8 mb-2 text-sm block">
            Enter your organization name
          </label>
          <input
            name="organization"
            type="text"
            className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800"
          />
           <button
            type="submit"
            className="bg-neutral-900 text-neutral-200 w-full mt-8 p-2 rounded hover:bg-neutral-800 hover:cursor-pointer"
            disabled={loading}
          >
            {loading ? "Loading..." : "Continue"}
          </button>
        </form>
        )}

        {step === "step3-register" && (
           <form onSubmit={handleStep3Register} className="w-full">
           <p className="text-neutral-300 text-xl text-center mt-8">Check your email. We sent a code to verify your account.</p>
            <label className="text-neutral-200 mt-8 mb-2 text-sm block">
             Enter the code
           </label>
           <input
             name="code"
             type="text"
             className="bg-neutral-700 w-full p-2 rounded text-white outline-none border border-stone-800"
           />
            <button
             type="submit"
             className="bg-neutral-900 text-neutral-200 w-full mt-8 p-2 rounded hover:bg-neutral-800 hover:cursor-pointer"
             disabled={loading}
           >
             {loading ? "Loading..." : "Continue"}
           </button>
         </form>
        )}
      </div>

      <div className="absolute bottom-4 right-4">
        <p className="text-neutral-400 text-xs">
          <Link to="/about">About</Link> | © 2025 VISION
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
