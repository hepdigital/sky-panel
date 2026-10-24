"use client";

import { createContext, useContext } from "react";

/** Stokta olmayan kumaş renkleri (hex). Teklif ekranında seçilemez; sepette zaten olan renk görünmeye devam eder. */
const OutOfStock = createContext<ReadonlySet<string>>(new Set());

export const ColorStockProvider = OutOfStock.Provider;
export const useOutOfStock = () => useContext(OutOfStock);
