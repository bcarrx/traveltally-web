package yentracker.controller;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;

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

    private static final String DATA_DIR = "data";
    private final ObjectMapper mapper = new ObjectMapper();

    @PostConstruct
    public void init() { new File(DATA_DIR).mkdirs(); }

    // ── File helpers ──
    private File expensesFile(String pin) { return new File(DATA_DIR + "/" + pin + "/expenses.json"); }
    private File currencyFile(String pin)  { return new File(DATA_DIR + "/" + pin + "/currency.json"); }
    private void ensureUserDir(String pin) { new File(DATA_DIR + "/" + pin).mkdirs(); }

    private List<Expense> loadExpenses(String pin) {
        File f = expensesFile(pin);
        if (!f.exists()) return new ArrayList<>();
        try {
            List<Expense> list = mapper.readValue(f, new TypeReference<List<Expense>>() {});
            list.forEach(e -> { if (e.getDate() == null) e.setDate(LocalDate.now().toString()); });
            return list;
        } catch (IOException e) { return new ArrayList<>(); }
    }

    private void saveExpenses(String pin, List<Expense> expenses) {
        ensureUserDir(pin);
        try { mapper.writerWithDefaultPrettyPrinter().writeValue(expensesFile(pin), expenses); }
        catch (IOException e) { System.err.println("[TravelTally] Save failed: " + e.getMessage()); }
    }

    private Currency loadCurrency(String pin) {
        File f = currencyFile(pin);
        if (!f.exists()) return new Currency("JPY", '¥', 0.0064);
        try { return mapper.readValue(f, Currency.class); }
        catch (IOException e) { return new Currency("JPY", '¥', 0.0064); }
    }

    private void saveCurrency(String pin, Currency currency) {
        ensureUserDir(pin);
        try { mapper.writerWithDefaultPrettyPrinter().writeValue(currencyFile(pin), currency); }
        catch (IOException e) { System.err.println("[TravelTally] Currency save failed: " + e.getMessage()); }
    }

    private boolean invalidPin(String pin) {
        return pin == null || pin.trim().isEmpty() || !pin.matches("[0-9]{4,8}");
    }

    private Map<String, Object> error(String msg) {
        Map<String, Object> e = new HashMap<>();
        e.put("error", msg);
        return e;
    }

    // ── Currency ──
    // To change the default currency, edit the Currency constructor calls below.
    // To add live exchange rate updates, replace the hardcoded ER values with
    // a call to a free API like https://api.exchangerate.host/latest?base=USD
    // and invert the rate (e.g. 1 / rate_for_JPY gives JPY->USD rate).
    @GetMapping("/currency")
    public Object getCurrency(@RequestHeader(value = "X-Pin", defaultValue = "") String pin) {
        if (invalidPin(pin)) return error("Invalid PIN");
        return loadCurrency(pin);
    }

    @PostMapping("/currency")
    public Object setCurrency(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                              @RequestBody Currency newCurr) {
        if (invalidPin(pin)) return error("Invalid PIN");
        saveCurrency(pin, newCurr);
        return newCurr;
    }

    // ── Convert ──
    @GetMapping("/convert")
    public Object convert(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                          @RequestParam double amount) {
        if (invalidPin(pin)) return error("Invalid PIN");
        Currency curr = loadCurrency(pin);
        Map<String, Object> result = new HashMap<>();
        result.put("foreign", amount);
        result.put("usd", amount * curr.getER());
        result.put("currency", curr.getCurrName());
        result.put("symbol", String.valueOf(curr.getSymbol()));
        return result;
    }

    // ── Expenses ──
    @PostMapping("/expense")
    public Object addExpense(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                             @RequestBody Expense expense) {
        if (invalidPin(pin)) return error("Invalid PIN");
        expense.setDate(LocalDate.now().toString());
        List<Expense> expenses = loadExpenses(pin);
        expenses.add(expense);
        saveExpenses(pin, expenses);
        return expense;
    }

    @GetMapping("/expenses")
    public Object listExpenses(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                               @RequestParam(required = false) String date) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Expense> expenses = loadExpenses(pin);
        if (date != null && !date.isEmpty()) {
            return expenses.stream().filter(e -> date.equals(e.getDate())).collect(Collectors.toList());
        }
        return expenses;
    }

    @DeleteMapping("/expenses")
    public Object clearExpenses(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                                @RequestParam(required = false) String date) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Expense> expenses = loadExpenses(pin);
        if (date != null && !date.isEmpty()) {
            expenses.removeIf(e -> date.equals(e.getDate()));
        } else {
            expenses.clear();
        }
        saveExpenses(pin, expenses);
        Map<String, Object> response = new HashMap<>();
        response.put("status", "cleared");
        return response;
    }

    // ── Summary ──
    @GetMapping("/summary")
    public Object getSummary(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                             @RequestParam(required = false) String date) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Expense> expenses = loadExpenses(pin);
        Currency curr = loadCurrency(pin);
        List<Expense> subset = (date != null && !date.isEmpty())
            ? expenses.stream().filter(e -> date.equals(e.getDate())).collect(Collectors.toList())
            : expenses;
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("usdTotal",     subset.stream().mapToDouble(Expense::getUsd).sum());
        s.put("costTotal",    subset.stream().mapToDouble(Expense::getCost).sum());
        s.put("transactions", subset.size());
        s.put("currency",     curr.getCurrName());
        s.put("symbol",       String.valueOf(curr.getSymbol()));
        return s;
    }

    // ── Days ──
    @GetMapping("/days")
    public Object getDays(@RequestHeader(value = "X-Pin", defaultValue = "") String pin) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Expense> expenses = loadExpenses(pin);
        Map<String, List<Expense>> byDate = new LinkedHashMap<>();
        for (Expense e : expenses) byDate.computeIfAbsent(e.getDate(), k -> new ArrayList<>()).add(e);
        List<Map<String, Object>> days = new ArrayList<>();
        for (Map.Entry<String, List<Expense>> entry : byDate.entrySet()) {
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("date",         entry.getKey());
            day.put("transactions", entry.getValue().size());
            day.put("usdTotal",     entry.getValue().stream().mapToDouble(Expense::getUsd).sum());
            day.put("costTotal",    entry.getValue().stream().mapToDouble(Expense::getCost).sum());
            days.add(day);
        }
        days.sort((a, b) -> ((String) b.get("date")).compareTo((String) a.get("date")));
        return days;
    }

    // ── Categories ──
    @GetMapping("/categories")
    public Object getCategories(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                                @RequestParam(required = false) String date) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Expense> expenses = loadExpenses(pin);
        List<Expense> subset = (date != null && !date.isEmpty())
            ? expenses.stream().filter(e -> date.equals(e.getDate())).collect(Collectors.toList())
            : expenses;
        Map<String, Double> catTotals = new LinkedHashMap<>();
        for (Expense e : subset) catTotals.merge(e.getCategory(), e.getUsd(), Double::sum);
        double grandTotal = catTotals.values().stream().mapToDouble(Double::doubleValue).sum();
        List<Map<String, Object>> result = new ArrayList<>();
        catTotals.entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
            .forEach(entry -> {
                Map<String, Object> cat = new LinkedHashMap<>();
                cat.put("category", entry.getKey());
                cat.put("usd",      entry.getValue());
                cat.put("percent",  grandTotal > 0 ? (entry.getValue() / grandTotal) * 100 : 0);
                result.add(cat);
            });
        return result;
    }
}