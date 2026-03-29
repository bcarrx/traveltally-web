package yentracker.model;

public class Expense {
    private double cost;
    private double usd;
    private String category;
    private String description;
    private String date;

    public Expense() {}

    public double getCost()                  { return cost; }
    public void setCost(double cost)         { this.cost = cost; }

    public double getUsd()                   { return usd; }
    public void setUsd(double usd)           { this.usd = usd; }

    public String getCategory()                    { return category; }
    public void setCategory(String category)       { this.category = category; }

    public String getDescription()                 { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getDate()              { return date; }
    public void setDate(String date)     { this.date = date; }
}