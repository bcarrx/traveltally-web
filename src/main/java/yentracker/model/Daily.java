package yentracker.model;

public class Daily {
    private double costTotal;
    private double usdTotal;
    private int transactions;

    public Daily() {}

    public Daily(double costTotal, double usdTotal, int transactions) {
        this.costTotal = costTotal;
        this.usdTotal = usdTotal;
        this.transactions = transactions;
    }

    public void addExpense(Expense purchase) {
        costTotal += purchase.getCost();
        usdTotal += purchase.getUsd();
        transactions++;
    }

    public void reset() {
        costTotal = 0;
        usdTotal = 0;
        transactions = 0;
    }

    public double getCostTotal() { return costTotal; }
    public double getUsdTotal() { return usdTotal; }
    public int getTransactions() { return transactions; }
}