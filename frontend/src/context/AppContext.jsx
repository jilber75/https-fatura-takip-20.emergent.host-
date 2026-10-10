import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, TOKEN_KEY } from "@/lib/api";

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [currency, setCurrencyState] = useState(localStorage.getItem("fp_cur") || "TRY");
  const [rates, setRates] = useState({ TRY: 1, USD: 1, EUR: 1 });
  const [lookups, setLookups] = useState({ categories: [], banks: [], caris: [] });

  const can = useCallback((m) => !!user?.permissions?.[m], [user]);

  const refreshLookups = useCallback(async () => {
    const safe = (p) => api.get(p).then((r) => r.data).catch(() => []);
    const [categories, banks, caris] = await Promise.all([safe("/categories"), safe("/banks"), safe("/caris")]);
    setLookups({ categories, banks, caris });
  }, []);

  const reloadRates = useCallback(() => api.get("/settings/rates").then((r) => setRates(r.data)).catch(() => {}), []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return setUser(false);
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);

  useEffect(() => {
    if (user) {
      refreshLookups();
      reloadRates();
    }
  }, [user, refreshLookups, reloadRates]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setUser(false);
  };

  const setCurrency = (c) => {
    localStorage.setItem("fp_cur", c);
    setCurrencyState(c);
  };

  return (
    <Ctx.Provider value={{ user, login, logout, can, currency, setCurrency, rates, reloadRates, lookups, refreshLookups }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
