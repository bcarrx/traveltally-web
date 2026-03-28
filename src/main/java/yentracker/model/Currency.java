package yentracker.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class Currency {
    private String currName;
    private double ER;
    private char symbol;

    public Currency() {}

    public Currency(String currName, char symbol, double ER) {
        this.currName = currName;
        this.symbol = symbol;
        this.ER = ER;
    }

    public String getCurrName() { return currName; }
    public void setCurrName(String currName) { this.currName = currName; }

    public char getSymbol() { return symbol; }
    public void setSymbol(char symbol) { this.symbol = symbol; }

    @JsonProperty("ER")
    public double getER() { return ER; }

    @JsonProperty("ER")
    public void setER(double ER) { this.ER = ER; }
}