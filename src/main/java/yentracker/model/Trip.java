package yentracker.model;

import java.util.ArrayList;
import java.util.List;

public class Trip {
    private String id;          // UUID
    private String name;        // e.g. "Japan 2026"
    private String startDate;   // YYYY-MM-DD
    private String endDate;     // null if active
    private Currency currency;
    private List<Expense> expenses = new ArrayList<>();

    public Trip() {}

    public Trip(String id, String name, String startDate, Currency currency) {
        this.id        = id;
        this.name      = name;
        this.startDate = startDate;
        this.currency  = currency;
    }

    public String getId()          { return id; }
    public void setId(String id)   { this.id = id; }

    public String getName()              { return name; }
    public void setName(String name)     { this.name = name; }

    public String getStartDate()               { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }

    public String getEndDate()             { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }

    public Currency getCurrency()              { return currency; }
    public void setCurrency(Currency currency) { this.currency = currency; }

    public List<Expense> getExpenses()               { return expenses; }
    public void setExpenses(List<Expense> expenses)  { this.expenses = expenses; }

    public boolean isActive() { return endDate == null || endDate.isEmpty(); }
}