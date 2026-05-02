import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Input from '../common/Input';
import Button from '../common/Button';
import { MILK_SOURCE_TYPES } from '../../constants';
import { buyerService } from '../../services/buyers/buyerService';
import { userService } from '../../services/users/userService';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function mapApiLinesToForm(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.map((it) => ({
    milkSource:
      it.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(it.milkSource) ? it.milkSource : 'cow',
    quantity: it.quantity != null ? String(it.quantity) : '',
    rate: it.rate != null ? String(it.rate) : '',
  }));
}

function defaultMilkLine(milkSource = 'cow') {
  return { milkSource, quantity: '', rate: '' };
}

/** @param {boolean} uniqueSources - disable chip if that milk type is already used on another row in this section */
function MilkLinesBlock({
  lines,
  onChangeLines,
  uniqueSources,
  sectionTitle,
  sectionHint,
  styles: S,
}) {
  const safeLines = lines && lines.length ? lines : [defaultMilkLine()];
  const addLine = () => {
    if (uniqueSources) {
      const used = new Set(safeLines.map((l) => l.milkSource));
      const nextType = MILK_SOURCE_TYPES.find((t) => !used.has(t.value));
      if (!nextType) {
        Alert.alert('All types added', 'Remove a line to add another milk type.');
        return;
      }
      onChangeLines([...safeLines, defaultMilkLine(nextType.value)]);
    } else {
      onChangeLines([...safeLines, defaultMilkLine('cow')]);
    }
  };
  return (
    <View>
      <Text style={S.label}>{sectionTitle}</Text>
      {!!sectionHint && <Text style={S.hint}>{sectionHint}</Text>}
      {safeLines.map((item, idx) => {
        const takenElsewhere = uniqueSources
          ? safeLines.filter((_, i) => i !== idx).map((l) => l.milkSource)
          : [];
        return (
          <View key={`${sectionTitle}-${idx}`} style={S.deliveryItemCard}>
            <Text style={S.deliveryItemCardTitle}>Milk type</Text>
            <View style={S.deliveryItemSourceRow}>
              {MILK_SOURCE_TYPES.map((src) => {
                const isActive = item.milkSource === src.value;
                const disabled =
                  uniqueSources && !isActive && takenElsewhere.includes(src.value);
                return (
                  <TouchableOpacity
                    key={src.value}
                    style={[
                      S.milkSourceChip,
                      disabled && S.milkSourceChipDisabled,
                      isActive && S.milkSourceChipActive,
                    ]}
                    onPress={() => {
                      if (disabled) return;
                      const next = [...safeLines];
                      next[idx] = { ...next[idx], milkSource: src.value };
                      onChangeLines(next);
                    }}
                    activeOpacity={disabled ? 1 : 0.7}
                  >
                    <Text
                      style={[
                        S.milkSourceChipText,
                        disabled && S.milkSourceChipDisabledText,
                        isActive && S.milkSourceChipTextActive,
                      ]}
                    >
                      {src.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={S.deliveryItemInputRow}>
              <View style={S.deliveryItemField}>
                <Text style={S.deliveryItemFieldLabel}>Qty (L)</Text>
                <Input
                  placeholder="0"
                  value={item.quantity}
                  onChangeText={(text) => {
                    const next = [...safeLines];
                    next[idx] = { ...next[idx], quantity: text };
                    onChangeLines(next);
                  }}
                  keyboardType="decimal-pad"
                  style={[S.input, S.deliveryItemInput]}
                />
              </View>
              <View style={S.deliveryItemField}>
                <Text style={S.deliveryItemFieldLabel}>Rate (₹/L)</Text>
                <Input
                  placeholder="0"
                  value={item.rate}
                  onChangeText={(text) => {
                    const next = [...safeLines];
                    next[idx] = { ...next[idx], rate: text };
                    onChangeLines(next);
                  }}
                  keyboardType="decimal-pad"
                  style={[S.input, S.deliveryItemInput]}
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  const next = safeLines.filter((_, i) => i !== idx);
                  onChangeLines(next.length ? next : [defaultMilkLine()]);
                }}
                style={S.removeItemBtn}
              >
                <Text style={S.removeItemBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={S.addDeliveryItemBtn} onPress={addLine}>
        <Text style={S.addDeliveryItemBtnText}>+ Add milk type</Text>
      </TouchableOpacity>
    </View>
  );
}

function buildFormDataFromBuyer(buyer) {
  if (!buyer) return null;
  const hasDays = buyer.deliveryDays && buyer.deliveryDays.length > 0;
  const hasCycle = Number(buyer.deliveryCycleDays) > 1 && buyer.deliveryCycleStartDate;
  let scheduleType = 'daily';
  if (hasDays) scheduleType = 'specific_days';
  else if (hasCycle) scheduleType = 'cycle';
  const startDate = buyer.deliveryCycleStartDate
    ? new Date(buyer.deliveryCycleStartDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const dailyQ =
    buyer.dailyQuantity != null ? buyer.dailyQuantity : buyer.quantity != null ? buyer.quantity : null;
  const fixedP = buyer.fixedPrice != null ? buyer.fixedPrice : buyer.rate != null ? buyer.rate : null;
  const ms =
    buyer.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(buyer.milkSource)
      ? buyer.milkSource
      : 'cow';

  const items =
    Array.isArray(buyer.deliveryItems) && buyer.deliveryItems.length > 0
      ? buyer.deliveryItems.map((it) => ({
          milkSource:
            it.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(it.milkSource) ? it.milkSource : 'cow',
          quantity: it.quantity != null ? String(it.quantity) : '',
          rate: it.rate != null ? String(it.rate) : '',
        }))
      : [
          {
            milkSource: ms,
            quantity: dailyQ != null ? String(dailyQ) : '',
            rate: fixedP != null ? String(fixedP) : '',
          },
        ];

  const deliveryShift = (() => {
    const s = buyer.deliveryShift;
    if (s === 'morning' || s === 'evening' || s === 'both') return s;
    return 'both';
  })();

  let morningDeliveryItems;
  let eveningDeliveryItems;
  if (deliveryShift === 'both') {
    const mSaved = mapApiLinesToForm(buyer.morningDeliveryItems);
    const eSaved = mapApiLinesToForm(buyer.eveningDeliveryItems);
    const fallback = items.map((row) => ({ ...row }));
    morningDeliveryItems = mSaved && mSaved.length ? mSaved : fallback.length ? fallback.map((r) => ({ ...r })) : [defaultMilkLine()];
    eveningDeliveryItems = eSaved && eSaved.length ? eSaved : fallback.length ? fallback.map((r) => ({ ...r })) : [defaultMilkLine()];
  }

  return {
    name: buyer.name || '',
    mobile: String(buyer.phone || buyer.mobile || '').trim(),
    email: buyer.email || '',
    milkFixedPrice: fixedP != null ? String(fixedP) : '',
    dailyMilkQuantity: dailyQ != null ? String(dailyQ) : '',
    milkSource: ms,
    deliveryItems: items,
    morningDeliveryItems,
    eveningDeliveryItems,
    deliveryScheduleType: scheduleType,
    deliveryDays: Array.isArray(buyer.deliveryDays) ? [...buyer.deliveryDays] : [],
    deliveryCycleDays: buyer.deliveryCycleDays ? String(buyer.deliveryCycleDays) : '2',
    deliveryCycleStartDate: startDate,
    billingMode: (() => {
      const m = buyer.billingMode;
      if (m === 'daily' || m === 'month_end' || m === 'custom') return m;
      if (buyer.billingDayOfMonth != null) return 'custom';
      return 'none';
    })(),
    billingDayOfMonth: buyer.billingDayOfMonth != null ? String(buyer.billingDayOfMonth) : '',
    deliveryShift,
  };
}

/**
 * Full buyer edit form (same fields as Buyers screen). Use on Quick Sale or Buyers page.
 */
export default function BuyerEditModal({ visible, buyer, onClose, onSaved }) {
  const [formData, setFormData] = useState(() => buildFormDataFromBuyer(buyer) || {});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && buyer) {
      const next = buildFormDataFromBuyer(buyer);
      if (next) setFormData(next);
    }
  }, [visible, buyer]);

  const handleSubmit = useCallback(async () => {
    if (!buyer?.userId) {
      Alert.alert('Error', 'Cannot update this buyer.');
      return;
    }
    if (!formData.name || !formData.mobile) {
      Alert.alert('Error', 'Please fill name and mobile number');
      return;
    }
    if (!/^[0-9]{10}$/.test(formData.mobile.trim())) {
      Alert.alert('Error', 'Mobile must be exactly 10 digits');
      return;
    }
    if (formData.deliveryScheduleType === 'specific_days' && (!formData.deliveryDays || formData.deliveryDays.length === 0)) {
      Alert.alert('Error', 'Select at least one delivery day');
      return;
    }
    if (formData.deliveryScheduleType === 'cycle' && !formData.deliveryCycleStartDate?.trim()) {
      Alert.alert('Error', 'Enter start date for delivery cycle');
      return;
    }

    const buildValidLines = (raw) =>
      (raw || [])
        .map((it) => {
          const q = parseFloat(it.quantity);
          const r = parseFloat(it.rate);
          if (!(q > 0 && r >= 0)) return null;
          const src = it.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(it.milkSource) ? it.milkSource : 'cow';
          return { milkSource: src, quantity: q, rate: r };
        })
        .filter(Boolean);

    const dupSource = (lines) => {
      const seen = new Set();
      for (const l of lines) {
        if (seen.has(l.milkSource)) return l.milkSource;
        seen.add(l.milkSource);
      }
      return null;
    };

    let builtItems;
    let builtMorning;
    let builtEvening;
    if (formData.deliveryShift === 'both') {
      builtMorning = buildValidLines(formData.morningDeliveryItems);
      builtEvening = buildValidLines(formData.eveningDeliveryItems);
      if (builtMorning.length === 0) {
        Alert.alert('Error', 'Morning: add at least one milk type with quantity and rate.');
        return;
      }
      if (builtEvening.length === 0) {
        Alert.alert('Error', 'Evening: add at least one milk type with quantity and rate.');
        return;
      }
      const dM = dupSource(builtMorning);
      if (dM) {
        Alert.alert('Error', `Morning: duplicate milk type (${dM}). One row per type.`);
        return;
      }
      const dE = dupSource(builtEvening);
      if (dE) {
        Alert.alert('Error', `Evening: duplicate milk type (${dE}). One row per type.`);
        return;
      }
      builtItems = [...builtMorning, ...builtEvening];
    } else {
      builtItems = buildValidLines(formData.deliveryItems);
      if (builtItems.length === 0) {
        Alert.alert('Error', 'Add at least one milk type with quantity (L) and rate (₹/L)');
        return;
      }
    }

    if (formData.billingMode === 'custom') {
      const billingDayRaw = String(formData.billingDayOfMonth || '').trim();
      if (!billingDayRaw) {
        Alert.alert('Error', 'Enter billing day (1–31) for custom schedule');
        return;
      }
      const bn = parseInt(billingDayRaw, 10);
      if (!Number.isInteger(bn) || bn < 1 || bn > 31) {
        Alert.alert('Error', 'Billing day must be between 1 and 31');
        return;
      }
    }
    try {
      setLoading(true);
      const first = formData.deliveryShift === 'both' ? builtMorning[0] : builtItems[0];
      const fixedPrice = first.rate;
      const dailyQuantity = builtItems.reduce((s, it) => s + it.quantity, 0);
      await userService.updateUser(buyer.userId, {
        name: formData.name.trim(),
        email: formData.email?.trim() || '',
        mobile: formData.mobile.trim(),
        milkFixedPrice: fixedPrice,
        dailyMilkQuantity: dailyQuantity,
      });
      const deliveryPayload = {
        quantity: first.quantity,
        rate: first.rate,
        milkSource: first.milkSource,
      };
      if (formData.deliveryShift === 'both') {
        deliveryPayload.morningDeliveryItems = builtMorning;
        deliveryPayload.eveningDeliveryItems = builtEvening;
        deliveryPayload.deliveryItems = null;
      } else {
        deliveryPayload.deliveryItems = builtItems;
        deliveryPayload.morningDeliveryItems = null;
        deliveryPayload.eveningDeliveryItems = null;
      }
      if (formData.deliveryScheduleType === 'daily') {
        deliveryPayload.deliveryDays = [];
        deliveryPayload.deliveryCycleDays = null;
        deliveryPayload.deliveryCycleStartDate = null;
      } else if (formData.deliveryScheduleType === 'specific_days') {
        deliveryPayload.deliveryDays = formData.deliveryDays && formData.deliveryDays.length ? formData.deliveryDays : [];
        deliveryPayload.deliveryCycleDays = null;
        deliveryPayload.deliveryCycleStartDate = null;
      } else {
        const cycleDays = parseInt(formData.deliveryCycleDays, 10) || 2;
        deliveryPayload.deliveryDays = null;
        deliveryPayload.deliveryCycleDays = cycleDays;
        deliveryPayload.deliveryCycleStartDate = formData.deliveryCycleStartDate
          ? new Date(formData.deliveryCycleStartDate).toISOString()
          : null;
      }
      if (formData.billingMode === 'none') {
        deliveryPayload.billingMode = null;
        deliveryPayload.billingDayOfMonth = null;
      } else if (formData.billingMode === 'daily') {
        deliveryPayload.billingMode = 'daily';
        deliveryPayload.billingDayOfMonth = null;
      } else if (formData.billingMode === 'month_end') {
        deliveryPayload.billingMode = 'month_end';
        deliveryPayload.billingDayOfMonth = null;
      } else {
        deliveryPayload.billingMode = 'custom';
        deliveryPayload.billingDayOfMonth = parseInt(String(formData.billingDayOfMonth || '').trim(), 10);
      }
      if (formData.deliveryShift === 'morning' || formData.deliveryShift === 'evening' || formData.deliveryShift === 'both') {
        deliveryPayload.deliveryShift = formData.deliveryShift;
      }
      if (buyer._id) {
        await buyerService.updateBuyer(buyer._id, deliveryPayload);
      }
      onClose?.();
      if (onSaved) await onSaved();
      Alert.alert('Success', 'Buyer updated successfully!');
    } catch (error) {
      console.error('Failed to update buyer:', error);
      Alert.alert('Error', error.message || 'Failed to update buyer. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [buyer, formData, onClose, onSaved]);

  if (!buyer) return null;

  const applyDeliveryShiftChange = (optId) => {
    setFormData((fd) => {
      if (optId === 'both') {
        const rows =
          fd.deliveryItems && fd.deliveryItems.length
            ? fd.deliveryItems.map((x) => ({ ...x }))
            : [defaultMilkLine()];
        return {
          ...fd,
          deliveryShift: 'both',
          morningDeliveryItems: rows.map((x) => ({ ...x })),
          eveningDeliveryItems: rows.map((x) => ({ ...x })),
        };
      }
      if (fd.deliveryShift === 'both') {
        if (optId === 'morning') {
          const rows =
            fd.morningDeliveryItems && fd.morningDeliveryItems.length ? fd.morningDeliveryItems : fd.deliveryItems;
          return {
            ...fd,
            deliveryShift: 'morning',
            deliveryItems:
              rows && rows.length ? rows.map((x) => ({ ...x })) : fd.deliveryItems || [defaultMilkLine()],
          };
        }
        if (optId === 'evening') {
          const rows =
            fd.eveningDeliveryItems && fd.eveningDeliveryItems.length ? fd.eveningDeliveryItems : fd.deliveryItems;
          return {
            ...fd,
            deliveryShift: 'evening',
            deliveryItems:
              rows && rows.length ? rows.map((x) => ({ ...x })) : fd.deliveryItems || [defaultMilkLine()],
          };
        }
      }
      return { ...fd, deliveryShift: optId };
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Buyer</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name *</Text>
            <Input
              placeholder="Enter buyer name"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              style={styles.input}
            />
            <Text style={styles.label}>Mobile Number *</Text>
            <Input
              placeholder="Enter 10 digit mobile number"
              value={formData.mobile}
              onChangeText={(text) => setFormData({ ...formData, mobile: text })}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Text style={styles.label}>Email (Optional)</Text>
            <Input
              placeholder="Enter email address"
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
            <Text style={styles.label}>Delivery shift (Quick Sale)</Text>
            <Text style={styles.hint}>Morning / evening only, or both rounds with separate milk per round.</Text>
            <View style={styles.billingModeRow}>
              {[
                { id: 'morning', label: 'Morning' },
                { id: 'evening', label: 'Evening' },
                { id: 'both', label: 'Both' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.billingModeChip, formData.deliveryShift === opt.id && styles.billingModeChipActive]}
                  onPress={() => applyDeliveryShiftChange(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.billingModeChipText, formData.deliveryShift === opt.id && styles.billingModeChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {formData.deliveryShift === 'both' ? (
              <>
                <MilkLinesBlock
                  sectionTitle="Morning milk *"
                  sectionHint="One row per milk type (no duplicate type). Add lines for cow, buffalo, etc."
                  lines={formData.morningDeliveryItems}
                  onChangeLines={(next) => setFormData((fd) => ({ ...fd, morningDeliveryItems: next }))}
                  uniqueSources
                  styles={styles}
                />
                <MilkLinesBlock
                  sectionTitle="Evening milk *"
                  sectionHint="Separate from morning. Same rules: one row per type in this round."
                  lines={formData.eveningDeliveryItems}
                  onChangeLines={(next) => setFormData((fd) => ({ ...fd, eveningDeliveryItems: next }))}
                  uniqueSources
                  styles={styles}
                />
              </>
            ) : (
              <MilkLinesBlock
                sectionTitle="Milk delivery (per day) *"
                sectionHint="Add one or more milk types with quantity and rate. Quick Sale &quot;Delivered&quot; uses this for that shift."
                lines={formData.deliveryItems}
                onChangeLines={(next) => setFormData((fd) => ({ ...fd, deliveryItems: next }))}
                uniqueSources={false}
                styles={styles}
              />
            )}

            <Text style={styles.label}>Auto billing</Text>
            <Text style={styles.hint}>Bill closes at 23:59 IST. Pick how often to generate a bill.</Text>
            <View style={styles.billingModeRow}>
              {[
                { id: 'none', label: 'Off' },
                { id: 'daily', label: 'Daily' },
                { id: 'month_end', label: 'Month end' },
                { id: 'custom', label: 'Custom day' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.billingModeChip, formData.billingMode === opt.id && styles.billingModeChipActive]}
                  onPress={() => setFormData({ ...formData, billingMode: opt.id })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.billingModeChipText, formData.billingMode === opt.id && styles.billingModeChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {formData.billingMode === 'custom' && (
              <>
                <Text style={styles.sublabel}>Day of month (1–31)</Text>
                <Input
                  placeholder="e.g. 10"
                  value={formData.billingDayOfMonth}
                  onChangeText={(text) => setFormData({ ...formData, billingDayOfMonth: text })}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </>
            )}

            <Text style={styles.label}>Delivery schedule (Quick Sale)</Text>
            <Text style={styles.hint}>Choose when this buyer gets milk. They will appear in Quick Sale only on these days.</Text>
            <View style={styles.scheduleTypeRow}>
              {['daily', 'specific_days', 'cycle'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.scheduleTypeBtn, formData.deliveryScheduleType === type && styles.scheduleTypeBtnActive]}
                  onPress={() => setFormData({ ...formData, deliveryScheduleType: type })}
                >
                  <Text style={[styles.scheduleTypeBtnText, formData.deliveryScheduleType === type && styles.scheduleTypeBtnTextActive]}>
                    {type === 'daily' ? 'Daily' : type === 'specific_days' ? 'Specific days' : 'Every N days'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {formData.deliveryScheduleType === 'specific_days' && (
              <View style={styles.daysRow}>
                {DAY_LABELS.map((label, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.dayChip, formData.deliveryDays && formData.deliveryDays.includes(idx) && styles.dayChipActive]}
                    onPress={() => {
                      const current = formData.deliveryDays || [];
                      const next = current.includes(idx) ? current.filter((d) => d !== idx) : [...current, idx].sort((a, b) => a - b);
                      setFormData({ ...formData, deliveryDays: next });
                    }}
                  >
                    <Text style={[styles.dayChipText, formData.deliveryDays && formData.deliveryDays.includes(idx) && styles.dayChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {formData.deliveryScheduleType === 'cycle' && (
              <View style={styles.cycleRow}>
                <View style={styles.cycleField}>
                  <Text style={styles.sublabel}>Every</Text>
                  <View style={styles.cycleSelectRow}>
                    {[2, 3].map((n) => (
                      <TouchableOpacity
                        key={n}
                        style={[styles.cycleOption, formData.deliveryCycleDays === String(n) && styles.cycleOptionActive]}
                        onPress={() => setFormData({ ...formData, deliveryCycleDays: String(n) })}
                      >
                        <Text style={[styles.cycleOptionText, formData.deliveryCycleDays === String(n) && styles.cycleOptionTextActive]}>
                          {n === 2 ? '2nd day' : '3rd day'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.cycleField}>
                  <Text style={styles.sublabel}>Start date</Text>
                  <Input
                    placeholder="YYYY-MM-DD"
                    value={formData.deliveryCycleStartDate}
                    onChangeText={(text) => setFormData({ ...formData, deliveryCycleStartDate: text })}
                    style={styles.input}
                  />
                </View>
              </View>
            )}

            <Button title={loading ? 'Updating...' : 'Update Buyer'} onPress={handleSubmit} disabled={loading} style={styles.createButton} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  formContainer: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F9F9F9',
    borderColor: '#E0E0E0',
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  scheduleTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  scheduleTypeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  scheduleTypeBtnActive: {
    backgroundColor: '#4CAF50',
  },
  scheduleTypeBtnText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  scheduleTypeBtnTextActive: {
    color: '#fff',
  },
  deliveryItemCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  deliveryItemCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  deliveryItemSourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    marginHorizontal: -4,
  },
  milkSourceChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginHorizontal: 4,
    marginBottom: 8,
  },
  milkSourceChipActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  milkSourceChipDisabled: {
    opacity: 0.35,
  },
  milkSourceChipDisabledText: {
    color: '#9e9e9e',
  },
  milkSourceChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212529',
  },
  milkSourceChipTextActive: {
    color: '#fff',
  },
  deliveryItemInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  deliveryItemField: {
    flex: 1,
    minWidth: 90,
    marginHorizontal: 5,
    marginBottom: 4,
  },
  deliveryItemFieldLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
    fontWeight: '500',
  },
  deliveryItemInput: {
    width: 70,
    marginBottom: 0,
  },
  removeItemBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  removeItemBtnText: {
    color: '#c62828',
    fontSize: 13,
    fontWeight: '600',
  },
  addDeliveryItemBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
  },
  addDeliveryItemBtnText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
  },
  billingModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  billingModeChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#E8E8E8',
    marginRight: 8,
    marginBottom: 8,
  },
  billingModeChipActive: {
    backgroundColor: '#1565C0',
  },
  billingModeChipText: {
    fontSize: 13,
    color: '#444',
    fontWeight: '600',
  },
  billingModeChipTextActive: {
    color: '#fff',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  dayChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  dayChipActive: {
    backgroundColor: '#2196F3',
  },
  dayChipText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: '#fff',
  },
  cycleRow: {
    marginBottom: 12,
  },
  cycleField: {
    marginBottom: 10,
  },
  sublabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  cycleSelectRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  cycleOption: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  cycleOptionActive: {
    backgroundColor: '#4CAF50',
  },
  cycleOptionText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  cycleOptionTextActive: {
    color: '#fff',
  },
  createButton: {
    marginTop: 10,
    marginBottom: 10,
  },
});
