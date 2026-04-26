import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Keyboard,
  I18nManager,
  ScrollView,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../services/api';

// Enable RTL for Hebrew support
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const HomeScreen = ({ navigation }) => {
  // State management
  const [products, setProducts] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);

  // Request location permission on mount
  useEffect(() => {
    requestLocationPermission();
  }, []);

  /**
   * Request device location permission
   */
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationPermissionDenied(true);
        setLocationLoading(false);
        Alert.alert(
          'הרשאת מיקום',
          'נדרש גישה למיקום כדי למצוא חנויות קרובות.',
          [{ text: 'אישור' }]
        );
        return;
      }
      getCurrentLocation();
    } catch (error) {
      console.error('Error requesting location permission:', error);
      setLocationLoading(false);
      Alert.alert('שגיאה', 'לא הצלח לבקש הרשאת מיקום');
    }
  };

  /**
   * Get current user location
   */
  const getCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('שגיאה', 'לא הצלח לקבל את המיקום שלך');
    } finally {
      setLocationLoading(false);
    }
  };

  /**
   * Add product to shopping list
   */
  const addProduct = () => {
    if (!inputValue.trim()) {
      Alert.alert('מוצר ריק', 'אנא הזן שם מוצר');
      return;
    }

    const quantityNum = parseFloat(quantity) || 1;
    if (quantityNum <= 0) {
      Alert.alert('כמות לא תקינה', 'הכמות חייבת להיות גדולה מ-0');
      return;
    }

    const newProduct = {
      id: Date.now(),
      name: inputValue.trim(),
      quantity: quantityNum,
      product_id: inputValue.trim().toLowerCase().replace(/\s+/g, '_'),
    };

    setProducts([...products, newProduct]);
    setInputValue('');
    setQuantity('1');
    Keyboard.dismiss();
  };

  /**
   * Remove product from shopping list
   */
  const removeProduct = (id) => {
    setProducts(products.filter(p => p.id !== id));
  };

  /**
   * Clear entire shopping list
   */
  const clearList = () => {
    Alert.alert(
      'מחק רשימה',
      'האם אתה בטוח שברצונך למחוק את כל המוצרים?',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: () => setProducts([]),
        },
      ]
    );
  };

  /**
   * Compare prices and navigate to results
   */
  const comparePrice = async () => {
    if (products.length === 0) {
      Alert.alert('רשימה ריקה', 'אנא הוסף לפחות מוצר אחד');
      return;
    }

    if (!location) {
      Alert.alert('אין מיקום', 'אנא הפעל מיקום כדי להמשיך');
      await requestLocationPermission();
      return;
    }

    try {
      setLoading(true);

      const response = await api.compareBasketPrices({
        items: products,
        latitude: location.latitude,
        longitude: location.longitude,
        radius,
      });

      if (response.success) {
        navigation.navigate('Results', {
          comparison: response.data,
          items: products,
          location,
        });
      } else {
        Alert.alert('שגיאה', response.error || 'לא הצלח להשוות מחירים');
      }
    } catch (error) {
      console.error('Error comparing prices:', error);
      Alert.alert('שגיאה', 'לא הצלח להשוות מחירים. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Render shopping list item as card
   */
  const renderProduct = ({ item }) => (
    <View style={styles.productCard}>
      <View style={styles.cardContent}>
        <View style={styles.productInfo}>
          <View style={styles.productDetailsContainer}>
            <Text style={styles.productName}>{item.name}</Text>
            <View style={styles.quantityBadge}>
              <MaterialIcons name="shopping-bag" size={12} color="#FFF" />
              <Text style={styles.quantityText}>{item.quantity}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => removeProduct(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={20} color="#E53935" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Grocer-E</Text>
          <Text style={styles.subtitle}>משווה מחירים לסופרמרקטים בישראל</Text>
        </View>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="shopping-outline" size={32} color="#2E7D32" />
        </View>
      </View>

      {/* Location Status Banner */}
      {!locationPermissionDenied && location && !locationLoading && (
        <View style={styles.locationBannerSuccess}>
          <View style={styles.locationBannerContent}>
            <MaterialIcons name="location-on" size={18} color="#FFF" />
            <View style={styles.locationInfo}>
              <Text style={styles.locationTitle}>המיקום שלך זוהה</Text>
              <Text style={styles.locationCoords}>
                {location.latitude.toFixed(4)}° , {location.longitude.toFixed(4)}°
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={getCurrentLocation} style={styles.refreshButton}>
            <MaterialIcons name="refresh" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Location Loading */}
      {locationLoading && (
        <View style={styles.locationLoadingBanner}>
          <ActivityIndicator size="small" color="#2E7D32" />
          <Text style={styles.locationLoadingText}>מחפש מיקום...</Text>
        </View>
      )}

      {/* Location Permission Denied */}
      {locationPermissionDenied && !locationLoading && (
        <View style={styles.locationBannerWarning}>
          <MaterialIcons name="warning" size={18} color="#FFF" />
          <Text style={styles.warningText}>נדרשת הרשאת מיקום</Text>
          <TouchableOpacity onPress={requestLocationPermission} style={styles.enableButton}>
            <Text style={styles.enableButtonText}>הפעל</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Product Input Section */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>הוסף מוצרים</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.productInput}
              placeholder="שם מוצר (לחם, חלב, גבינה...)"
              placeholderTextColor="#999"
              value={inputValue}
              onChangeText={setInputValue}
              onSubmitEditing={addProduct}
            />
            <MaterialCommunityIcons name="barcode" size={20} color="#2E7D32" />
          </View>

          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={[styles.addButton, loading && styles.addButtonDisabled]}
              onPress={addProduct}
              disabled={loading}
            >
              <MaterialIcons name="add" size={24} color="#FFF" />
              <Text style={styles.addButtonText}>הוסף</Text>
            </TouchableOpacity>

            <View style={styles.quantityContainer}>
              <Text style={styles.quantityLabel}>כמות</Text>
              <TextInput
                style={styles.quantityInput}
                placeholder="1"
                placeholderTextColor="#999"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* Search Radius Selector */}
        <View style={styles.radiusSection}>
          <Text style={styles.sectionTitle}>טווח חיפוש</Text>
          <View style={styles.radiusGrid}>
            {[3, 5, 10, 20].map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.radiusButton,
                  radius === r && styles.radiusButtonActive,
                ]}
                onPress={() => setRadius(r)}
              >
                <Text
                  style={[
                    styles.radiusButtonText,
                    radius === r && styles.radiusButtonTextActive,
                  ]}
                >
                  {r} ק״מ
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Shopping List Section */}
        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.sectionTitle}>רשימת קניות</Text>
              <Text style={styles.itemsCount}>{products.length} פריטים</Text>
            </View>
            {products.length > 0 && (
              <TouchableOpacity onPress={clearList} style={styles.clearButton}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color="#E53935" />
              </TouchableOpacity>
            )}
          </View>

          {products.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="basket-outline" size={56} color="#DDD" />
              <Text style={styles.emptyText}>עדיין לא הוספת מוצרים</Text>
              <Text style={styles.emptySubtext}>
                התחל בהוספת מוצרים כדי להשוות מחירים
              </Text>
            </View>
          ) : (
            <FlatList
              data={products}
              renderItem={renderProduct}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>

        {/* Spacing for footer button */}
        {products.length > 0 && <View style={styles.footerSpacer} />}
      </ScrollView>

      {/* Compare Button Footer */}
      {products.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.compareButton, loading && styles.compareButtonLoading]}
            onPress={comparePrice}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="compare-arrows" size={22} color="#FFF" />
                <Text style={styles.compareButtonText}>השווה מחירים</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: '#E8F5E9',
    marginBottom: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2E7D32',
  },
  subtitle: {
    fontSize: 12,
    color: '#558B2F',
    marginTop: 2,
    fontWeight: '500',
  },
  headerIcon: {
    marginHorizontal: 12,
  },
  locationBannerSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2E7D32',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
  },
  locationBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationInfo: {
    marginHorizontal: 10,
    flex: 1,
  },
  locationTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  locationCoords: {
    fontSize: 11,
    color: '#C8E6C9',
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  locationLoadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 8,
  },
  locationLoadingText: {
    fontSize: 13,
    color: '#558B2F',
    fontWeight: '500',
    marginHorizontal: 10,
  },
  locationBannerWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 10,
    elevation: 3,
  },
  warningText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
    marginHorizontal: 10,
  },
  enableButton: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  enableButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
  },
  inputSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E8F5E9',
  },
  productInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#333',
  },
  quantityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quantityContainer: {
    flex: 1,
  },
  quantityLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#558B2F',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  quantityInput: {
    backgroundColor: '#F8F9F7',
    borderWidth: 1.5,
    borderColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
  },
  addButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    elevation: 3,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  radiusSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  radiusGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  radiusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F8F9F7',
    borderWidth: 2,
    borderColor: '#E8F5E9',
    alignItems: 'center',
  },
  radiusButtonActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  radiusButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#558B2F',
  },
  radiusButtonTextActive: {
    color: '#FFF',
  },
  listSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemsCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  clearButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#CCC',
    marginTop: 6,
  },
  listContent: {
    paddingVertical: 0,
  },
  productCard: {
    backgroundColor: '#F8F9F7',
    borderRadius: 12,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2E7D32',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productDetailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B5E20',
    flex: 1,
  },
  quantityBadge: {
    backgroundColor: '#2E7D32',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quantityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  cardSeparator: {
    height: 0,
  },
  footerSpacer: {
    height: 100,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 2,
    borderTopColor: '#E8F5E9',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
  },
  compareButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 4,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  compareButtonLoading: {
    opacity: 0.8,
  },
  compareButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default HomeScreen;
