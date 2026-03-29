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
import java.util.LinkedHashMap;
import java.util.UUID;
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
    private File tripsFile(String pin) { return new File(DATA_DIR + "/" + pin + "/trips.json"); }

    private void ensureUserDir(String pin) { new File(DATA_DIR + "/" + pin).mkdirs(); }

    private List<Trip> loadTrips(String pin) {
        File f = tripsFile(pin);
        if (!f.exists()) return new ArrayList<>();
        try {
            return mapper.readValue(f, new TypeReference<List<Trip>>() {});
        } catch (IOException e) { return new ArrayList<>(); }
    }

    private void saveTrips(String pin, List<Trip> trips) {
        ensureUserDir(pin);
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(tripsFile(pin), trips);
        } catch (IOException e) {
            System.err.println("[TravelTally] Save failed: " + e.getMessage());
        }
    }

    private boolean invalidPin(String pin) {
        return pin == null || pin.trim().isEmpty() || !pin.matches("[0-9]{4,8}");
    }

    private Map<String, Object> error(String msg) {
    Map<String, Object> e = new HashMap<>();
    e.put("error", msg);
    return e;
}

    private Trip activeTrip(List<Trip> trips) {
        return trips.stream().filter(Trip::isActive).findFirst().orElse(null);
    }

    // ══════════════════════════════════════════
    // TRIP ENDPOINTS
    // ══════════════════════════════════════════

    // List all trips for a PIN
    @GetMapping("/trips")
    public Object getTrips(@RequestHeader(value = "X-Pin", defaultValue = "") String pin) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        // Return summary (no expenses list for brevity)
        return trips.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",           t.getId());
            m.put("name",         t.getName());
            m.put("startDate",    t.getStartDate());
            m.put("endDate",      t.getEndDate());
            m.put("active",       t.isActive());
            m.put("currency",     t.getCurrency() != null ? t.getCurrency().getCurrName() : "JPY");
            m.put("symbol",       t.getCurrency() != null ? String.valueOf(t.getCurrency().getSymbol()) : "¥");
            m.put("transactions", t.getExpenses().size());
            m.put("usdTotal",     t.getExpenses().stream().mapToDouble(Expense::getUsd).sum());
            return m;
        }).collect(Collectors.toList());
    }

    // Start a new trip
    @PostMapping("/trips/start")
    public Object startTrip(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                            @RequestBody Map<String, Object> body) {
        if (invalidPin(pin)) return error("Invalid PIN");

        List<Trip> trips = loadTrips(pin);

        // End any currently active trip first
        trips.stream().filter(Trip::isActive).forEach(t -> t.setEndDate(LocalDate.now().toString()));

        String name      = (String) body.getOrDefault("name", "My Trip");
        String currName  = (String) body.getOrDefault("currName", "JPY");
        String symStr    = (String) body.getOrDefault("symbol", "¥");
        char symbol      = symStr.isEmpty() ? '¥' : symStr.charAt(0);
        double er        = body.containsKey("ER") ? ((Number) body.get("ER")).doubleValue() : 0.0064;

        Currency currency = new Currency(currName, symbol, er);
        Trip trip = new Trip(UUID.randomUUID().toString(), name, LocalDate.now().toString(), currency);
        trips.add(trip);
        saveTrips(pin, trips);

        return tripSummary(trip);
    }

    // End the active trip
    @PostMapping("/trips/end")
    public Object endTrip(@RequestHeader(value = "X-Pin", defaultValue = "") String pin) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        Trip active = activeTrip(trips);
        if (active == null) return error("No active trip");
        active.setEndDate(LocalDate.now().toString());
        saveTrips(pin, trips);
        return tripSummary(active);
    }

    // Get active trip info
    @GetMapping("/trips/active")
    public Object getActiveTrip(@RequestHeader(value = "X-Pin", defaultValue = "") String pin) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        Trip active = activeTrip(trips);
        if (active == null) return error("No active trip");
        return tripSummary(active);
    }

    // Get a specific past trip's full data
    @GetMapping("/trips/{id}")
    public Object getTrip(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                          @PathVariable String id) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        return trips.stream().filter(t -> id.equals(t.getId())).findFirst()
            .map(this::tripSummary)
            .orElse(error("Trip not found"));
    }

    private Map<String, Object> tripSummary(Trip t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",           t.getId());
        m.put("name",         t.getName());
        m.put("startDate",    t.getStartDate());
        m.put("endDate",      t.getEndDate());
        m.put("active",       t.isActive());
        m.put("currency",     t.getCurrency() != null ? t.getCurrency().getCurrName() : "JPY");
        m.put("symbol",       t.getCurrency() != null ? String.valueOf(t.getCurrency().getSymbol()) : "¥");
        m.put("ER",           t.getCurrency() != null ? t.getCurrency().getER() : 0.0064);
        m.put("transactions", t.getExpenses().size());
        m.put("usdTotal",     t.getExpenses().stream().mapToDouble(Expense::getUsd).sum());
        return m;
    }

    // ══════════════════════════════════════════
    // CURRENCY (scoped to active trip)
    // ══════════════════════════════════════════

    @GetMapping("/currency")
    public Object getCurrency(@RequestHeader(value = "X-Pin", defaultValue = "") String pin) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        Trip active = activeTrip(trips);
        if (active == null) return new Currency("JPY", '¥', 0.0064);
        return active.getCurrency() != null ? active.getCurrency() : new Currency("JPY", '¥', 0.0064);
    }

    @PostMapping("/currency")
    public Object setCurrency(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                              @RequestBody Currency newCurr) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        Trip active = activeTrip(trips);
        if (active == null) return error("No active trip");
        active.setCurrency(newCurr);
        saveTrips(pin, trips);
        return newCurr;
    }

    // ══════════════════════════════════════════
    // EXPENSES (scoped to active trip or by trip id)
    // ══════════════════════════════════════════

    @PostMapping("/expense")
    public Object addExpense(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                             @RequestBody Expense expense) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        Trip active = activeTrip(trips);
        if (active == null) return error("No active trip. Start a trip first.");
        expense.setDate(LocalDate.now().toString());
        active.getExpenses().add(expense);
        saveTrips(pin, trips);
        return expense;
    }

    @GetMapping("/expenses")
    public Object listExpenses(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                               @RequestParam(required = false) String date,
                               @RequestParam(required = false) String tripId) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);

        List<Expense> expenses;
        if (tripId != null && !tripId.isEmpty()) {
            Trip trip = trips.stream().filter(t -> tripId.equals(t.getId())).findFirst().orElse(null);
            expenses = trip != null ? trip.getExpenses() : new ArrayList<>();
        } else {
            Trip active = activeTrip(trips);
            expenses = active != null ? active.getExpenses() : new ArrayList<>();
        }

        if (date != null && !date.isEmpty()) {
            return expenses.stream().filter(e -> date.equals(e.getDate())).collect(Collectors.toList());
        }
        return expenses;
    }

    @DeleteMapping("/expenses")
    public Object clearExpenses(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                                @RequestParam(required = false) String date) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);
        Trip active = activeTrip(trips);
        if (active == null) return error("No active trip");

        if (date != null && !date.isEmpty()) {
            active.getExpenses().removeIf(e -> date.equals(e.getDate()));
        } else {
            active.getExpenses().clear();
        }
        saveTrips(pin, trips);
        Map<String, String> response = new HashMap<>();
        response.put("status", "cleared");
        return response;
    }

    // ══════════════════════════════════════════
    // SUMMARY, DAYS, CATEGORIES
    // ══════════════════════════════════════════

    @GetMapping("/summary")
    public Object getSummary(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                             @RequestParam(required = false) String date,
                             @RequestParam(required = false) String tripId) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);

        Trip trip;
        if (tripId != null && !tripId.isEmpty()) {
            trip = trips.stream().filter(t -> tripId.equals(t.getId())).findFirst().orElse(null);
        } else {
            trip = activeTrip(trips);
        }

        if (trip == null) {
            Map<String, Object> s = new HashMap<>();
            s.put("usdTotal", 0); s.put("costTotal", 0); s.put("transactions", 0);
            s.put("currency", "JPY"); s.put("symbol", "¥");
            return s;
        }

        List<Expense> subset = (date != null && !date.isEmpty())
            ? trip.getExpenses().stream().filter(e -> date.equals(e.getDate())).collect(Collectors.toList())
            : trip.getExpenses();

        Currency curr = trip.getCurrency() != null ? trip.getCurrency() : new Currency("JPY", '¥', 0.0064);

        Map<String, Object> s = new LinkedHashMap<>();
        s.put("usdTotal",     subset.stream().mapToDouble(Expense::getUsd).sum());
        s.put("costTotal",    subset.stream().mapToDouble(Expense::getCost).sum());
        s.put("transactions", subset.size());
        s.put("currency",     curr.getCurrName());
        s.put("symbol",       String.valueOf(curr.getSymbol()));
        return s;
    }

    @GetMapping("/days")
    public Object getDays(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                          @RequestParam(required = false) String tripId) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);

        Trip trip;
        if (tripId != null && !tripId.isEmpty()) {
            trip = trips.stream().filter(t -> tripId.equals(t.getId())).findFirst().orElse(null);
        } else {
            trip = activeTrip(trips);
        }

        if (trip == null) return new ArrayList<>();

        Map<String, List<Expense>> byDate = new LinkedHashMap<>();
        for (Expense e : trip.getExpenses()) {
            byDate.computeIfAbsent(e.getDate(), k -> new ArrayList<>()).add(e);
        }

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

    @GetMapping("/categories")
    public Object getCategories(@RequestHeader(value = "X-Pin", defaultValue = "") String pin,
                                @RequestParam(required = false) String date,
                                @RequestParam(required = false) String tripId) {
        if (invalidPin(pin)) return error("Invalid PIN");
        List<Trip> trips = loadTrips(pin);

        Trip trip;
        if (tripId != null && !tripId.isEmpty()) {
            trip = trips.stream().filter(t -> tripId.equals(t.getId())).findFirst().orElse(null);
        } else {
            trip = activeTrip(trips);
        }

        List<Expense> expenses = trip != null ? trip.getExpenses() : new ArrayList<>();
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