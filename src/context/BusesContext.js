import { createContext, useContext } from 'react';

export const BusesContext = createContext();

export const useBuses = () => useContext(BusesContext);
