package yentracker.controller;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import yentracker.model.*;


import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;
import java.io.*;


@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ExpenseController {

    private final List<Expense> expenses = new ArrayList<>();
    private final Daily session = new Daily(0, 0, 0);
    private Currency currentCurrency = new Currency("JPY", '¥', 0.0064);

    private static final String EXPENSES_FILE = "expenses.json";
    private static final String CURRENCY_FILE  = "currency.json";
    private final ObjectMapper mapper = new ObjectMapper();

    // ── Load saved data on startup ──
    @PostConstruct
    public void loadFromDisk() {
        File cf = new File(CURRENCY_FILE);
        if (cf.exists()) {
            try {
                currentCurrency = mapper.readValue(cf, Currency.class);
                System.out.println("[YenTracker] Loaded saved currency: " + currentCurrency.getCurrName());
            } catch (IOException e) {
                System.err.println("[YenTracker] Could not load currency: " + e.getMessage());
            }
        }

        File ef = new File(EXPENSES_FILE);
        if (ef.exists()) {
            try {
                List<Expense> saved = mapper.readValue(ef, new TypeReference<List<Expense>>() {});
                expenses.addAll(saved);
                for (Expense exp : saved) {
                    session.addExpense(exp);
                }
                System.out.println("[YenTracker] Loaded " + saved.size() + " saved expenses.");
            } catch (IOException e) {
                System.err.println("[YenTracker] Could not load expenses: " + e.getMessage());
            }
        }
    }

    private void saveExpenses() {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(new File(EXPENSES_FILE), expenses);
        } catch (IOException e) {
            System.err.println("[YenTracker] Could not save expenses: " + e.getMessage());
        }
    }

    private void saveCurrency() {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(new File(CURRENCY_FILE), currentCurrency);
        } catch (IOException e) {
            System.err.println("[YenTracker] Could not save currency: " + e.getMessage());
        }
    }

    @GetMapping("/currency")
    public Currency getCurrency() { return currentCurrency; }

    @PostMapping("/currency")
    public Currency setCurrency(@RequestBody Currency newCurr) {
        this.currentCurrency = newCurr;
        saveCurrency();
        return newCurr;
    }

    @GetMapping("/convert")
    public Map<String, Object> convert(@RequestParam double amount) {
        double usd = amount * currentCurrency.getER();
        Map<String, Object> result = new HashMap<>();
        result.put("foreign", amount);
        result.put("usd", usd);
        result.put("currency", currentCurrency.getCurrName());
        result.put("symbol", String.valueOf(currentCurrency.getSymbol()));
        return result;
    }

    @PostMapping("/expense")
    public Expense addExpense(@RequestBody Expense expense) {
        expenses.add(expense);
        session.addExpense(expense);
        saveExpenses();
        return expense;
    }

    @GetMapping("/expenses")
    public List<Expense> listExpenses() { return expenses; }

    @DeleteMapping("/expenses")
    public Map<String, String> clearExpenses() {
        expenses.clear();
        session.reset();
        saveExpenses();
        Map<String, String> response = new HashMap<>();
        response.put("status", "cleared");
        return response;
    }

    @GetMapping("/summary")
    public Map<String, Object> getSummary() {
        Map<String, Object> s = new HashMap<>();
        s.put("usdTotal", session.getUsdTotal());
        s.put("costTotal", session.getCostTotal());
        s.put("transactions", session.getTransactions());
        s.put("currency", currentCurrency.getCurrName());
        s.put("symbol", String.valueOf(currentCurrency.getSymbol()));
        return s;
    }
}