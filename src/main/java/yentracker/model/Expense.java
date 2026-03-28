package yentracker.model;

public class Expense {
    private double cost;
    private double usd;
    private String category;
    private String description;
    private String date; // ISO format: YYYY-MM-DD

    public Expense() {}

    public Expense(double cost, double usd, String category, String description, String date) {
        this.cost = cost;
        this.usd = usd;
        this.category = category;
        this.description = description;
        this.date = date;
    }

    public double getCost() { return cost; }
    public void setCost(double cost) { this.cost = cost; }

    public double getUsd() { return usd; }
    public void setUsd(double usd) { this.usd = usd; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }
}