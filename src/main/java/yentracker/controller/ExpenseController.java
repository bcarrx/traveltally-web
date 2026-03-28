package yentracker.controller;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;
import jakarta.annotation.PostConstruct;
import java.io.*;
import java.time.LocalDate;
import java.util.stream.Collectors;
import yentracker.model.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ExpenseController {

    private final List<Expense> expenses = new ArrayList<>();
    private Currency currentCurrency = new Currency("JPY", '¥', 0.0064);

    private static final String EXPENSES_FILE = "expenses.json";
    private static final String CURRENCY_FILE  = "currency.json";
    private final ObjectMapper mapper = new ObjectMapper();

    // ── Startup ──
    @PostConstruct
    public void loadFromDisk() {
        File cf = new File(CURRENCY_FILE);
        if (cf.exists()) {
            try {
                currentCurrency = mapper.readValue(cf, Currency.class);
            } catch (IOException e) {
                System.err.println("[TravelTally] Could not load currency: " + e.getMessage());
            }
        }
        File ef = new File(EXPENSES_FILE);
        if (ef.exists()) {
            try {
                List<Expense> saved = mapper.readValue(ef, new TypeReference<List<Expense>>() {});
                // Backfill date for old entries that don't have one
                for (Expense exp : saved) {
                    if (exp.getDate() == null || exp.getDate().isEmpty()) {
                        exp.setDate(LocalDate.now().toString());
                    }
                }
                expenses.addAll(saved);
                System.out.println("[TravelTally] Loaded " + saved.size() + " expenses.");
            } catch (IOException e) {
                System.err.println("[TravelTally] Could not load expenses: " + e.getMessage());
            }
        }
    }

    // ── Save helpers ──
    private void saveExpenses() {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(new File(EXPENSES_FILE), expenses);
        } catch (IOException e) {
            System.err.println("[TravelTally] Could not save expenses: " + e.getMessage());
        }
    }

    private void saveCurrency() {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(new File(CURRENCY_FILE), currentCurrency);
        } catch (IOException e) {
            System.err.println("[TravelTally] Could not save currency: " + e.getMessage());
        }
    }

    // ── Currency ──
    @GetMapping("/currency")
    public Currency getCurrency() { return currentCurrency; }

    @PostMapping("/currency")
    public Currency setCurrency(@RequestBody Currency newCurr) {
        this.currentCurrency = newCurr;
        saveCurrency();
        return newCurr;
    }

    // ── Convert ──
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

    // ── Expenses ──
    @PostMapping("/expense")
    public Expense addExpense(@RequestBody Expense expense) {
        // Always stamp with today's date server-side
        expense.setDate(LocalDate.now().toString());
        expenses.add(expense);
        saveExpenses();
        return expense;
    }

    @GetMapping("/expenses")
    public List<Expense> listExpenses(@RequestParam(required = false) String date) {
        if (date != null && !date.isEmpty()) {
            return expenses.stream()
                .filter(e -> date.equals(e.getDate()))
                .collect(Collectors.toList());
        }
        return expenses;
    }

    @DeleteMapping("/expenses")
    public Map<String, String> clearExpenses(@RequestParam(required = false) String date) {
        if (date != null && !date.isEmpty()) {
            expenses.removeIf(e -> date.equals(e.getDate()));
        } else {
            expenses.clear();
        }
        saveExpenses();
        Map<String, String> response = new HashMap<>();
        response.put("status", "cleared");
        return response;
    }

    // ── Summary (today or all-time) ──
    @GetMapping("/summary")
    public Map<String, Object> getSummary(@RequestParam(required = false) String date) {
        List<Expense> subset = (date != null && !date.isEmpty())
            ? expenses.stream().filter(e -> date.equals(e.getDate())).collect(Collectors.toList())
            : expenses;

        double usdTotal  = subset.stream().mapToDouble(Expense::getUsd).sum();
        double costTotal = subset.stream().mapToDouble(Expense::getCost).sum();

        Map<String, Object> s = new HashMap<>();
        s.put("usdTotal", usdTotal);
        s.put("costTotal", costTotal);
        s.put("transactions", subset.size());
        s.put("currency", currentCurrency.getCurrName());
        s.put("symbol", String.valueOf(currentCurrency.getSymbol()));
        return s;
    }

    // ── Days list ──
    @GetMapping("/days")
    public List<Map<String, Object>> getDays() {
        // Group expenses by date, return each day's summary sorted newest first
        Map<String, List<Expense>> byDate = new LinkedHashMap<>();
        for (Expense e : expenses) {
            byDate.computeIfAbsent(e.getDate(), k -> new ArrayList<>()).add(e);
        }

        List<Map<String, Object>> days = new ArrayList<>();
        for (Map.Entry<String, List<Expense>> entry : byDate.entrySet()) {
            List<Expense> dayExpenses = entry.getValue();
            double usdTotal  = dayExpenses.stream().mapToDouble(Expense::getUsd).sum();
            double costTotal = dayExpenses.stream().mapToDouble(Expense::getCost).sum();

            Map<String, Object> day = new HashMap<>();
            day.put("date", entry.getKey());
            day.put("transactions", dayExpenses.size());
            day.put("usdTotal", usdTotal);
            day.put("costTotal", costTotal);
            days.add(day);
        }

        // Sort newest first
        days.sort((a, b) -> ((String) b.get("date")).compareTo((String) a.get("date")));
        return days;
    }

    // ── Category breakdown ──
    @GetMapping("/categories")
    public List<Map<String, Object>> getCategories(@RequestParam(required = false) String date) {
        List<Expense> subset = (date != null && !date.isEmpty())
            ? expenses.stream().filter(e -> date.equals(e.getDate())).collect(Collectors.toList())
            : expenses;

        Map<String, Double> catTotals = new LinkedHashMap<>();
        for (Expense e : subset) {
            catTotals.merge(e.getCategory(), e.getUsd(), Double::sum);
        }

        double grandTotal = catTotals.values().stream().mapToDouble(Double::doubleValue).sum();

        List<Map<String, Object>> result = new ArrayList<>();
        catTotals.entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
            .forEach(entry -> {
                Map<String, Object> cat = new HashMap<>();
                cat.put("category", entry.getKey());
                cat.put("usd", entry.getValue());
                cat.put("percent", grandTotal > 0 ? (entry.getValue() / grandTotal) * 100 : 0);
                result.add(cat);
            });

        return result;
    }
}