import { createContext, useState, useEffect } from "react";
import { useContext } from "react";

const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // New loading state

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("user");
      }
    }
    if (storedToken) {
      setToken(storedToken);
    }
    setLoading(false); // Done loading after fetching localStorage values
  }, []);

  const login = (userData, token) => {
    setUser(userData);
    setToken(token);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", token);
  };

  const isSecurity = () => {
    if (user && user.roles) {
      return user.roles.some(role => role === "SECURITY");
    }
    return false
  }

  const isAdmin = () => {
    if (user && user.roles) {
      return user.roles.some(role => role === "ADMIN");
    }
    return false
  }

  const getRoles = () => {
    if (user && user.roles) {
      return user.roles;
    } else {
      return null;
    }
  }

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  const isAuthenticated = () => user !== null;

  return (
    <UserContext.Provider value={{ token, user, login, logout, isAuthenticated, loading, isAdmin, isSecurity, getRoles }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
