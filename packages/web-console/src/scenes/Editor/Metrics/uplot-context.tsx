import React, { createContext, useContext, useState } from 'react';

type UplotContextType = {
  width: number;
  setWidth: (width: number) => void;
};

const UplotContext = createContext<UplotContextType | undefined>(undefined);

export const UplotProvider = ({ children }: { children: React.ReactNode }) => {
  const [width, setWidth] = useState(0);
  return (
    <UplotContext.Provider value={{ width, setWidth }}>
      {children}
    </UplotContext.Provider>
  );
};

export const useUplot = () => {
  const context = useContext(UplotContext);
  if (!context) throw new Error('useUplot must be used within UplotProvider');
  return context;
};
