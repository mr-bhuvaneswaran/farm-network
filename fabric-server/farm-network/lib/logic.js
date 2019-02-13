'use strict';

/**
 * Track the share of a stock from owner to requestor
 * @param {org.farm.network.stockTransaction} tx - the trade to be processed
 * @transaction
 * @returns{Boolean}
 */
async function tradeCommodity(tx) {
    
    // factory creation
    let factory = getFactory();

    // serializer creation
    let serializer = getSerializer();

    // registry access
    let requestRegistry = await getAssetRegistry('org.farm.network.StockRequest');
    let stockRegistry = await getAssetRegistry('org.farm.network.Crop');
    let shareRegistry = await getAssetRegistry('org.farm.network.Share');
    let userRegistry  = await getParticipantRegistry('org.farm.network.User');
    let commodityRegistry  = await getAssetRegistry('org.farm.network.Commodity');
    let messageRegistry = await getAssetRegistry('org.farm.network.Messages');
    

    // resource access
    let requestResource = await requestRegistry.get(tx.requestId);
    let request = serializer.toJSON(requestResource);
    let stockResource = await stockRegistry.get(request.insuranceId);
    let stock = serializer.toJSON(stockResource);
    let requestorResource = await userRegistry.get(request.requestor);
    let requestor = serializer.toJSON(requestorResource);
    let ownerResource = await userRegistry.get(request.owner);
    let owner  = serializer.toJSON(ownerResource);
    let commodityResource = await commodityRegistry.get(stock.commodityId);
    let commodity = serializer.toJSON(commodityResource);


    if(stock.quantity >= request.quantity){
        stock.quantity -= request.quantity;
        await stockRegistry.update(serializer.fromJSON(stock));
    }else{
        throw new Error('Insufficient quantity');
    }
    
    
    if(requestor.balance >= (commodity.fnc)*request.quantity){
        requestor.balance -=  (commodity.fnc)*request.quantity;
        owner.balance += (commodity.fnc)*request.quantity;
        await userRegistry.update(serializer.fromJSON(requestor));
        await userRegistry.update(serializer.fromJSON(owner));
    }else{
        throw new Error('Insufficient balance');
    }
    
    let share = factory.newResource('org.farm.network','Share',Date.now().toString()+request.owner);
    share.cropId = request.insuranceId;
    share.ownerId = request.requestor;
    share.quantity = request.quantity;
    share.title = "Share for commodity " + commodity.name + "-" + commodity.type;
    share.description = request.quantity + " kg " + commodity.name + "-" + commodity.type + " share bought for " +
    (commodity.fnc)*request.quantity + " FNC, expected harvest on " + stock.harvestDate ; 
    share.status = false;
    await shareRegistry.add(share);    


    let ownerMessage = factory.newResource('org.farm.network','Messages',Date.now().toString()+request.owner);
    ownerMessage.title = "Share sold";
    ownerMessage.description = "Share for " + request.quantity  + " Kg " + commodity.name + "-" + commodity.type + " has been sold sucessfully";
    ownerMessage.userId = request.owner;
    let requestorMessage = factory.newResource('org.farm.network','Messages',Date.now().toString()+request.requestor);
    requestorMessage.title = "Share request Accepted";
    requestorMessage.description = "Share request of " + request.quantity  + " Kg " + commodity.name + "-" + commodity.type + " has been accepted by the owner. Check your shares";
    requestorMessage.userId = request.requestor;
    await messageRegistry.addAll([ownerMessage,requestorMessage]);

    await requestRegistry.remove(serializer.fromJSON(request));


    return true;
}


/**
 * Track the share of a stock from owner to requestor
 * @param {org.farm.network.stockReady} tx - the stock to be processed
 * @transaction
 * @returns{Boolean}
 */
async function stockstatus(tx) {

    let shareRegistry = await getAssetRegistry('org.farm.network.Share');
    
    let q = buildQuery('SELECT org.farm.network.Share WHERE (cropId == _$cropId)');

    let shares = await query(q,{cropId:tx.cropId});

    for (let n = 0; n < shares.length; n++) {
        let share = shares[n];

        share.status = true;
        await shareRegistry.update(share);
    }    
    return true;
}


/**
 *  Track the share transfer amoung holders
 * @param {org.farm.network.transferShare} tx - the share transfer
 * @transaction
 * @returns{Boolean}
 */

 async function shareTransaction(tx){
    
    let userRegistry = await getParticipantRegistry('org.farm.network.User');
    let userExist = await userRegistry.exists(tx.newOwnerId);
    
    if(userExist == false){
        return false;
    }

    let shareRegistry = await getAssetRegistry('org.farm.network.Share');
    let share = await shareRegistry.get(tx.shareId);
    share.ownerId = tx.newOwnerId;
    await shareRegistry.update(share);

    return true;
 }
