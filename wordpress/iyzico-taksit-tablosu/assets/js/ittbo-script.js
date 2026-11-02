/**
 * İyzico Taksit Tablosu By Ogün - JavaScript
 * Version: 1.0.0
 * 
 * Handles:
 * 1. Rendering the installment table
 * 2. Calculating interest rates
 * 3. Listening for WooCommerce variation changes
 */

(function($) {
    'use strict';

    /**
     * Format currency in Turkish Lira
     */
    function ittboFormatCurrency(amount, symbol) {
        const formatted = new Intl.NumberFormat('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
        
        return formatted + ' ' + (symbol || 'TL');
    }

    /**
     * Calculate installment table data
     */
    function ittboCalculateTableData(price, rates) {
        const installments = [1, 2, 3, 6, 9, 12];
        
        return installments.map(function(count) {
            let totalAmount;
            
            if (count === 1) {
                // Cash payment - no interest
                totalAmount = price;
            } else {
                // Apply interest rate
                const interest = rates[count] || 0;
                totalAmount = price * (1 + interest);
            }

            const monthlyAmount = totalAmount / count;

            return {
                count: count,
                totalAmount: totalAmount,
                monthlyAmount: monthlyAmount
            };
        });
    }

    /**
     * Render the installment table
     */
    window.ittboRenderTable = function(currentPrice) {
        const container = document.getElementById('ittbo-iyzico-installment-container');
        if (!container) {
            return;
        }

        const settings = window.ittboIyzicoSettings;
        if (!settings) {
            console.error('İyzico Taksit Tablosu: Ayarlar yüklenemedi.');
            return;
        }

        const plans = ittboCalculateTableData(currentPrice, settings.rates);
        const banks = settings.banks || [];
        const currencySymbol = settings.currencySymbol || 'TL';

        let html = '<table class="ittbo-table">';
        
        // --- Header ---
        html += '<thead><tr>';
        html += '<th class="ittbo-sticky-col">Taksit</th>';
        banks.forEach(function(bank) {
            html += '<th>' + bank.name + '</th>';
        });
        html += '</tr></thead>';

        // --- Body ---
        html += '<tbody>';
        plans.forEach(function(plan) {
            html += '<tr>';
            
            // Label Column
            const label = plan.count === 1 ? 'Peşin' : plan.count + ' Taksit';
            html += '<td class="ittbo-sticky-col ittbo-label-cell">' + label + '</td>';

            // Bank Columns
            banks.forEach(function(bank) {
                html += '<td class="ittbo-bank-cell" style="background-color: ' + bank.color + '">';
                html += '<div class="ittbo-cell-content">';
                
                if (plan.count === 1) {
                    // Cash payment
                    html += '<div class="ittbo-price-main">' + ittboFormatCurrency(plan.totalAmount, currencySymbol) + '</div>';
                } else {
                    // Installment payment
                    html += '<div class="ittbo-price-main">' + ittboFormatCurrency(plan.monthlyAmount, currencySymbol) + ' x ' + plan.count + '</div>';
                    html += '<div class="ittbo-price-total">TOPLAM: ' + ittboFormatCurrency(plan.totalAmount, currencySymbol) + '</div>';
                }

                html += '</div></td>';
            });

            html += '</tr>';
        });
        html += '</tbody></table>';

        container.innerHTML = html;
    };

    /**
     * Initialize the table
     */
    window.ittboInitTable = function() {
        if (window.ittboIyzicoSettings && window.ittboIyzicoSettings.initialPrice) {
            window.ittboRenderTable(window.ittboIyzicoSettings.initialPrice);
        }
    };

    /**
     * Document ready
     */
    $(document).ready(function() {
        // Initial render
        window.ittboInitTable();

        // --- Modal Functionality ---
        
        // Open modal
        $(document).on('click', '.ittbo-modal-trigger', function(e) {
            e.preventDefault();
            const modal = $('#ittbo-modal');
            modal.addClass('ittbo-modal-open');
            $('body').addClass('ittbo-modal-active');
            
            // Render table in modal
            if (window.ittboIyzicoSettings && window.ittboIyzicoSettings.initialPrice) {
                const modalContainer = document.getElementById('ittbo-iyzico-installment-modal');
                if (modalContainer) {
                    const settings = window.ittboIyzicoSettings;
                    const plans = ittboCalculateTableData(settings.initialPrice, settings.rates);
                    const banks = settings.banks || [];
                    const currencySymbol = settings.currencySymbol || 'TL';

                    let html = '<table class="ittbo-table">';
                    
                    html += '<thead><tr>';
                    html += '<th class="ittbo-sticky-col">Taksit</th>';
                    banks.forEach(function(bank) {
                        html += '<th>' + bank.name + '</th>';
                    });
                    html += '</tr></thead>';

                    html += '<tbody>';
                    plans.forEach(function(plan) {
                        html += '<tr>';
                        
                        const label = plan.count === 1 ? 'Peşin' : plan.count + ' Taksit';
                        html += '<td class="ittbo-sticky-col ittbo-label-cell">' + label + '</td>';

                        banks.forEach(function(bank) {
                            html += '<td class="ittbo-bank-cell" style="background-color: ' + bank.color + '">';
                            html += '<div class="ittbo-cell-content">';
                            
                            if (plan.count === 1) {
                                html += '<div class="ittbo-price-main">' + ittboFormatCurrency(plan.totalAmount, currencySymbol) + '</div>';
                            } else {
                                html += '<div class="ittbo-price-main">' + ittboFormatCurrency(plan.monthlyAmount, currencySymbol) + ' x ' + plan.count + '</div>';
                                html += '<div class="ittbo-price-total">TOPLAM: ' + ittboFormatCurrency(plan.totalAmount, currencySymbol) + '</div>';
                            }

                            html += '</div></td>';
                        });

                        html += '</tr>';
                    });
                    html += '</tbody></table>';

                    modalContainer.innerHTML = html;
                }
            }
        });

        // Close modal
        function closeModal() {
            $('#ittbo-modal').removeClass('ittbo-modal-open');
            $('body').removeClass('ittbo-modal-active');
        }

        $(document).on('click', '.ittbo-modal-close', closeModal);
        $(document).on('click', '.ittbo-modal-overlay', closeModal);
        
        // Close on ESC key
        $(document).on('keydown', function(e) {
            if (e.key === 'Escape' && $('#ittbo-modal').hasClass('ittbo-modal-open')) {
                closeModal();
            }
        });

        // --- WooCommerce Integration ---
        
        // Listen for variation changes (Variable Products)
        $('.single_variation_wrap').on('show_variation', function(event, variation) {
            if (variation && variation.display_price) {
                // Update table with variation price
                window.ittboRenderTable(variation.display_price);
                
                // Update modal settings
                if (window.ittboIyzicoSettings) {
                    window.ittboIyzicoSettings.initialPrice = variation.display_price;
                }
            }
        });

        // Listen for variation reset
        $('.reset_variations').on('click', function() {
            if (window.ittboIyzicoSettings && window.ittboIyzicoSettings.initialPrice) {
                // Revert to original product price
                window.ittboRenderTable(window.ittboIyzicoSettings.initialPrice);
            }
        });

        // Alternative: Listen to WooCommerce's price update event
        $(document.body).on('updated_cart_totals', function() {
            // Re-initialize if needed
            if (window.ittboIyzicoSettings) {
                window.ittboInitTable();
            }
        });
    });

})(jQuery);